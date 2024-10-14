import fs from "fs";
import path from "path";
import * as t from "@babel/types";
import { getAst, saveJson } from "./utils";
import traverse from "@babel/traverse";

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
      } else if (/\.(ts|tsx|js)$/.test(fullPath)) {
        files.push(fullPath);
      }
    });
  }

  return files;
};

const parseFile = (filePath: string) => {
  const content = fs.readFileSync(filePath, "utf-8");

  // 使用 Babel 解析源代码
  const ast = getAst(filePath);
  // 未导出的请求，用于排查api是否被遗漏
  const unExportRequest: any[] = [];
  const apiCalls: Record<string, Record<string, string[]>> = {};

  traverse(ast, {
    CallExpression(path) {
      const callee = path.get("callee");
      if (
        (t.isMemberExpression(callee.node) &&
          t.isIdentifier(callee.node.property, { name: "get" }) &&
          t.isIdentifier(callee.node.object, { name: "http" })) ||
        t.isIdentifier(callee.node, { name: "request" })
      ) {
        if (path.node.start === null || path.node.end === null) {
          throw new Error("未找到函数调用位置");
        }
        const detail = content.slice(path.node.start, path.node.end);
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
      } else if (
        t.isMemberExpression(callee.node) &&
        t.isIdentifier(callee.node.property, { name: "post" }) &&
        t.isIdentifier(callee.node.object, { name: "http" })
      ) {
        const urlArg = path.node.arguments[0];
        if (t.isStringLiteral(urlArg)) {
          const api = urlArg.value;
          const funcName = path.getFunctionParent()?.node.id?.name;
          if (funcName) {
            apiCalls[filePath] = apiCalls[filePath] || {};
            apiCalls[filePath][funcName] = apiCalls[filePath][funcName] || [];
            apiCalls[filePath][funcName].push(api);
          }
        }
      }
    },
  });

  return [apiCalls, unExportRequest] as const;
};

const readCache = (filePath: string) => {
  const cacheFileName = filePath.replaceAll("/", "_");
  const cacheFilePath = path.resolve(__dirname, `.cache/${cacheFileName}.json`);
  if (fs.existsSync(cacheFilePath)) {
    return JSON.parse(fs.readFileSync(cacheFilePath, "utf-8"));
  } else {
    return null;
  }
};

const saveCache = (filePath: string, result: any) => {
  const cacheFileName = filePath.replaceAll("/", "_");
  const cacheFilePath = path.resolve(__dirname, `.cache/${cacheFileName}.json`);
  saveJson(cacheFilePath, result);
};

export const findAllApi = (dir: string) => {
  const cacheResult = readCache(dir);
  if (cacheResult) {
    console.log(dir, "此目录已缓存所有api的映射，返回缓存结果");
    return cacheResult;
  }

  const allFiles = findAllFiles(dir);
  let allApiCalls: Record<string, Record<string, string[]>> = {};
  let allUnExportRequest: any[] = [];
  for (const filePath of allFiles) {
    if (
      !filePath.includes("node_modules") &&
      !filePath.includes(".d.ts") &&
      !filePath.includes("static")
    ) {
      const [apiCalls, unExportRequest] = parseFile(filePath);
      allApiCalls = { ...allApiCalls, ...apiCalls };
      allUnExportRequest = [...allUnExportRequest, ...unExportRequest];
    }
  }
  saveCache(dir, [allApiCalls, allUnExportRequest]);
  return [allApiCalls, allUnExportRequest] as const;
};
