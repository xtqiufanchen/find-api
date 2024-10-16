import fs from "fs";
import path from "path";
import * as t from "@babel/types";
import { getAst, saveJson } from "./utils";
import traverse, { NodePath } from "@babel/traverse";

/** 解析所有文件，找出所有定义api的方法与文件的映射 */
const findAllFiles = (dir: string): string[] => {
  if (dir.includes("node_modules")) return [];
  const dirs = [dir];
  const files: string[] = [];
  for (let i = 0; i < dirs.length; i++) {
    const currentDir = dirs[i];
    fs.readdirSync(dirs[i]).forEach((file) => {
      const fullPath = path.join(currentDir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        dirs.push(fullPath);
      } else if (/\.(ts|tsx|js|jsx)$/.test(fullPath) && !/\.d\.ts$/.test(fullPath)) {
        files.push(fullPath);
      }
    });
  }

  return files;
};

const extractVariable = (node: t.Node | null | undefined, path: NodePath, content: string) => {
  if (t.isStringLiteral(node)) {
    // 最简单的场景，就是字符串
    return { value: node.value}
  }
  if (t.isIdentifier(node)) {
    // 是变量
    const identifier = node
    // 通过identifier找到对应的值
    const binding = path.scope.getBinding(identifier.name);
    if (t.isVariableDeclarator(binding.path.node)) {
      const value = binding.path.node.init;
      if (t.isLiteral(value)) {
        return {value: value.value}
      } else {
        return { error: '解析url失败,定义处不是简单的变量声明' }
      }
    } else if (binding.kind == 'param') {
      return { error: '变量用的函数参数，是正常使用' }
    } else {
      return { error: '解析url失败,是 identifer，但不是 variable declarator' }
    }
    return
  } else if (t.isBinaryExpression(node) && node.operator === '+') {
    const { left, right } = node;
    const leftResult = extractVariable(left, path, content);
    const rightResult = extractVariable(right, path, content);
    if (leftResult.error || rightResult.error) {
      return { value: leftResult.value + rightResult.value, error: (leftResult.error || rightResult.error) + '解析url失败，不是变量声明' }
    } else {
      return { value: leftResult.value + rightResult.value }
    }
  } else if (t.isTemplateLiteral(node)) {
    let value = ''
    let error = ''
    for (let i = 0; i < node.quasis.length; i++) {
      const quasi = node.quasis[i];
      const expression = node.expressions[i]
      if (quasi.value.raw) {
        value += quasi.value.raw
      }
      if (expression) {
        if (t.isIdentifier(expression)) {
          const result = extractVariable(expression, path, content)
          if (result.error) {
            value += `\${${content.slice(expression.start, expression.end)}}`
          } else {
            value += result.value
          }
          error += result.error || ''
        } else {
          value += `\${${content.slice(expression.start, expression.end)}}`
          error = '解析url失败，模板字符串中的表达式不是identifier'
        }
      }
    }
    return { value, error }
  } else {
    return { error: '解析url失败，不是字符串，也不是表达式' }
  }
}

// 从调用函数中提取url
const extractUrlFromCallee = (path: NodePath<t.CallExpression>, content: string) => {
  if (t.isObjectExpression(path.node.arguments[0])) {
    const urlProperties = path.node.arguments[0].properties.find((prop) => prop.key.name === 'url');
    if (t.isObjectProperty(urlProperties)) {
      return extractVariable(urlProperties.value, path, content);
    } else {
      throw new Error('未找到url属性');
    }
  }
}

// hasUrlProperty
const getHasUrlProperty = (path: NodePath<t.CallExpression>) => {
  if (t.isObjectExpression(path.node.arguments[0])) {
    const urlProperties = path.node.arguments[0].properties.find((prop) => prop.key?.name === 'url');
    if (t.isObjectProperty(urlProperties)) {
      return true
    } else {
      return false;
    }
  }
  return false
}

const parseFile = (filePath: string) => {
  const content = fs.readFileSync(filePath, "utf-8");

  // 使用 Babel 解析源代码
  const ast = getAst(filePath);
  if (!ast) {
    console.log('解析失败 ' + filePath)
    return false
  }
  // 未导出的请求，用于排查api是否被遗漏
  const unExportRequest: any[] = [];
  const apiCalls: Record<string, Record<string, string[]>> = {};

  traverse(ast, {
    CallExpression(path) {
      const callee = path.get("callee");

      const hasUrlProperty = getHasUrlProperty(path);
      if (
        (t.isMemberExpression(callee.node) &&
          (t.isIdentifier(callee.node.property, { name: "get" }) || t.isIdentifier(callee.node.property, { name: "post" })) &&
          t.isIdentifier(callee.node.object, { name: "http" })) ||
        t.isIdentifier(callee.node, { name: "request" }) ||
        hasUrlProperty // 有url属性的调用方法，也认为是请求
      ) {
        if (path.node.start === null || path.node.end === null) {
          throw new Error("未找到函数调用位置");
        }
        const detail = {source: content.slice(path.node.start, path.node.end), parsed: extractUrlFromCallee(path, content)};

        if (detail) {
          const functionParent = path.getFunctionParent();
          if (!functionParent) {
            throw new Error("未找到函数父节点");
          }
          const exportDeclaration = functionParent.findParent((path) => {
            return (
              path.isDeclareExportDeclaration() ||
              path.isExportDefaultDeclaration() ||
              path.isExportNamedDeclaration()
            );
          });
          if (!exportDeclaration) {
            if (functionParent.isObjectMethod() || functionParent.isClassMethod()) {
              // 有可能作为对象定义的属性,取出对象的key
              const keyNode = functionParent.node.key;
              if (t.isIdentifier(keyNode)) {
                const funcName = keyNode.name;
                if (funcName) {
                  apiCalls[filePath] = apiCalls[filePath] || { __isNamespace__: [] };
                  apiCalls[filePath][funcName] = apiCalls[filePath][funcName] || [];
                  apiCalls[filePath][funcName].push(detail);
                }
                return
              } else {
                throw new Error('提取api失败，对象键名是 变量')
              }
            }
            if (functionParent.isArrowFunctionExpression() && t.isObjectProperty(functionParent.parent)) {
              // 有可能是匿名函数
              if (t.isIdentifier(functionParent.parent.key)) {
                const keyNode = functionParent.parent.key;
                const funcName = keyNode.name;
                if (funcName) {
                  apiCalls[filePath] = apiCalls[filePath] || { __isNamespace__: [] };
                  apiCalls[filePath][funcName] = apiCalls[filePath][funcName] || [];
                  apiCalls[filePath][funcName].push(detail);
                }
              } else {
                throw new Error('提取api失败，对象键名是 变量')
              }
            }
            unExportRequest.push({
              filePath,
              name: functionParent.node.id?.name,
            });
            return;
            // throw new Error('此api没有导出')
          }
          const declaration = (
            exportDeclaration.node as t.ExportNamedDeclaration
          ).declaration;
          if (!declaration) {
            throw new Error("未找到导出的函数声明");
          }
          if (t.isVariableDeclaration(declaration)) {
            const funcName = declaration.declarations[0].id.name;
            if (funcName) {
              apiCalls[filePath] = apiCalls[filePath] || {};
              apiCalls[filePath][funcName] = apiCalls[filePath][funcName] || [];
              apiCalls[filePath][funcName].push(detail);
            }
          } else if (t.isFunctionDeclaration(declaration)) {
            const funcName = declaration.id?.name;
            if (funcName) {
              apiCalls[filePath] = apiCalls[filePath] || {};
              apiCalls[filePath][funcName] = apiCalls[filePath][funcName] || [];
              apiCalls[filePath][funcName].push(detail);
            }
          } else {
            // debugger
            // throw new Error('未处理的导出类型' + declaration.type);
          }
          // if (functionParent?.isFunctionDeclaration()) {
          //   throw new Error('未处理的函数声明');
          // }
          // else if (functionParent.isFunctionExpression()) {
          //   throw new Error('未处理的函数表达式');
          // }
          // else if (functionParent.isArrowFunctionExpression()) {
          //   funcName = functionParent.
          // }
          // else {
          //   throw new Error('未处理的函数类型' + functionParent.type);
          // }
        }
      } else if (t.isMemberExpression(callee.node) && t.isIdentifier(callee.node.object, { name: "http" })) {
        throw new Error("未处理的请求类型" + callee.node.property);
      }
    },
  });

  return [apiCalls, unExportRequest] as const;
};

const version = '1.0.0';

const readCache = (filePath: string) => {
  const cacheFileName = filePath.replaceAll("/", "_");
  const cacheFilePath = path.resolve(__dirname, `.cache/${cacheFileName}_${version}.json`);
  if (fs.existsSync(cacheFilePath)) {
    return JSON.parse(fs.readFileSync(cacheFilePath, "utf-8"));
  } else {
    return null;
  }
};

const saveCache = (filePath: string, result: any) => {
  const cacheFileName = filePath.replaceAll("/", "_");
  const cacheFilePath = path.resolve(__dirname, `.cache/${cacheFileName}_${version}.json`);
  saveJson(cacheFilePath, result);
};

export const findAllApi = (dir: string) => {
  const cacheResult = readCache(dir);
  if (cacheResult) {
    console.log(dir, "此目录已缓存所有api的映射，返回缓存结果");
    return cacheResult;
  }
  const parseErrorFiles: string[] = [];
  const allFiles = findAllFiles(dir);
  let allApiCalls: Record<string, Record<string, string[]>> = {};
  let allUnExportRequest: any[] = [];
  for (const filePath of allFiles) {
    const result = parseFile(filePath);
    if (result === false) {
      parseErrorFiles.push(filePath);
    } else {
      const [apiCalls, unExportRequest] = result;
      allApiCalls = { ...allApiCalls, ...apiCalls };
      allUnExportRequest = [...allUnExportRequest, ...unExportRequest];
    }
  }
  saveCache(dir, [allApiCalls, allUnExportRequest]);
  console.log("解析失败的文件", parseErrorFiles);
  return [allApiCalls, allUnExportRequest] as const;
};
