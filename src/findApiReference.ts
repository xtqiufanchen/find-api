import fs from "fs";
import {
  getAst,
  getImportSpecifiers,
  resolveModulePath,
  matchUrlFromFunction,
} from "./utils";
import traverse from "@babel/traverse";
import path from 'path';

const referFiles: Record<string, any> = {};
const circularReferences: Record<string, string[]> = {};

const skipFiles: string[] = []
const checkFileShouldSkip = (filePath: string, srcDir: string) => {
  const relativePath = path.relative(srcDir, filePath)
  if (relativePath.startsWith("index")) {
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
        result.api[resolvedPath] = getImportSpecifiers(path.node).map((i) => {
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
