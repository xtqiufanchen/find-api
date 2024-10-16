import fs from "fs";
import {
  getAst,
  getImportSpecifiers,
  resolveModulePath,
  matchUrlFromFunction,
} from "./utils";
import traverse from "@babel/traverse";
import path from 'path';
import * as t from "@babel/types";

const referFiles: Record<string, any> = {};
const circularReferences: Record<string, string[]> = {};

const skipFiles: string[] = []
const checkFileShouldSkip = (filePath: string, srcDir: string) => {
  const relativePath = path.relative(srcDir, filePath)
  if (relativePath.startsWith("index")) {
    skipFiles.push(filePath)
    return true
  }
  if (relativePath.startsWith("router")) {
    skipFiles.push(filePath)
    return true
  }
  if (relativePath.startsWith("store")) {
    skipFiles.push(filePath)
    return true
  }
  if (relativePath.endsWith(".d.ts")) {
    skipFiles.push(filePath)
    return true
  }
}

const traverseImpl = (
  filePath: any,
  apiCalls: Record<string, any>,
  srcDir: string,
  result: Record<string, any>,
  onFindImport: (path: string, parentResult: Record<string, any>) => void
) => {
  const ast = getAst(filePath);
  if (!ast) {
    console.log("解析失败 ", filePath);
    return 
  }
  let importNameSpaceApi = []
  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      const resolvedPath = resolveModulePath(srcDir, filePath, source);
      if (resolvedPath === false) {
        return;
      }
      if (!resolvedPath) {
        throw new Error("未找到模块路径");
      }
      if (apiCalls[resolvedPath]) {
        if (apiCalls[resolvedPath].__isNamespace__ || t.isImportNamespaceSpecifier(path.node.specifiers[0])) {
          // 命名空间
          importNameSpaceApi.push(...getImportSpecifiers(path.node).map(item => ({name: item, path: resolvedPath})))
          return
        }
        result.api[resolvedPath] = getImportSpecifiers(path.node).map((i) => {
          if (!apiCalls[resolvedPath][i]) {
            // TODO: 遇到了 import * api from 'xxx/api' 的情况
            return {
              name: i,
              error: "未找到对应的 API",
              // origin: apiCalls[resolvedPath],
            };
          }
          return {
            name: i,
            url: apiCalls[resolvedPath][i][0].parsed?.value,
            error: apiCalls[resolvedPath][i][0].parsed?.error,
            source: apiCalls[resolvedPath][i][0].source,
            origin: apiCalls[resolvedPath][i],
          };
        });
      } else {
        result.children[resolvedPath] = { api: {}, children: {} };
        onFindImport(resolvedPath, result.children[resolvedPath]);
      }
    },
    CallExpression(path) {
      const callee = path.get("callee");
      // 动态 import
      if (callee.isImport()) {
        const source = (path.get("arguments")[0].node as any).value;
        const resolvedPath = resolveModulePath(srcDir, filePath, source);
        if (resolvedPath === false) {
          return;
        }
        if (!resolvedPath) {
          throw new Error("未找到模块路径");
        }
        result.children[resolvedPath] = { api: {}, children: {} };
        onFindImport(resolvedPath, result.children[resolvedPath]);
      }

      if (importNameSpaceApi.length) {
        // 找到调用命名空间的api
        if (t.isMemberExpression(callee.node) && t.isIdentifier(callee.node.object)) {
          const objectName = callee.node.object.name
          const apiPath = importNameSpaceApi.find(item => item.name === objectName)?.path
          if (apiPath) {
            const apiName = callee.node.property.name
            result.api[apiPath] = result.api[apiPath] || []
            result.api[apiPath].push({
              name: apiName,
              url: apiCalls[apiPath][apiName][0].parsed?.value,
              error: apiCalls[apiPath][apiName][0].parsed?.error,
              source: apiCalls[apiPath][apiName][0].source,
              origin: apiCalls[apiPath][0],
            })
          }

        }
      }
    },
  });
};

export const findApiReferences = (
  filePath: string,
  apiCalls: Record<string, any>,
  srcDir: string
): Record<string, any> => {
  const result: any = {
    api: {},
    children: {},
  };

  if (apiCalls[filePath]) {
    debugger;
    // for (const [funcName, apis] of Object.entries(apiCalls[filePath])) {
    //   result.api.push(...apis);
    // }
  }
  const eachQueue: any[] = [[filePath, result]];
  while (eachQueue.length) {
    const [filePath, parentResult] = eachQueue.shift();
    traverseImpl(
      filePath,
      apiCalls,
      srcDir,
      parentResult,
      (resolvedPath, result) => {
        if (referFiles[resolvedPath]) {
          circularReferences[filePath] = circularReferences[filePath] || [];
          circularReferences[filePath].push(resolvedPath);
          Object.assign(result, referFiles[resolvedPath]);
          return null;
        }
        if (!checkFileShouldSkip(resolvedPath, srcDir)) {
          eachQueue.push([resolvedPath, result]);
        }
      }
    );
    referFiles[filePath] = {
      api: parentResult.api,
      info: "此文件已被引用，跳过此文件子模块的解析，请手动查看子模块是否需要解析",
      children: {},
    };
  }
  if (skipFiles.length) {
    console.log("跳过解析的文件", skipFiles);
  }
  // traverseImpl(filePath, apiCalls, srcDir, result, (resolvedPath, parentResult) => {
  //   eachQueue.push([resolvedPath, parentResult]);
  // });
  return result;
};
