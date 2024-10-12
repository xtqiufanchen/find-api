import fs from 'fs';
import { getAst, getImportSpecifiers, resolveModulePath, matchUrlFromFunction } from './utils';
import traverse from '@babel/traverse';

const referFiles: Record<string, any> = {};

export const findApiReferences = (filePath: string, apiCalls: Record<string, any>, srcDir: string): Record<string, any> => {
  if (referFiles[filePath]) {
    return referFiles[filePath];
  }
  const result: any = {
    api: {},
    children: {},
  };
  // referFiles[filePath] = result;

  if (apiCalls[filePath]) {
    debugger
    // for (const [funcName, apis] of Object.entries(apiCalls[filePath])) {
    //   result.api.push(...apis);
    // }
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const ast = getAst(filePath);

  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      const resolvedPath = resolveModulePath(srcDir, filePath, source);
      if (resolvedPath === false) {
        return
      }
      if (!resolvedPath) {
        throw new Error('未找到模块路径');
      }
      if (apiCalls[resolvedPath]) {
        result.api[resolvedPath] = getImportSpecifiers(path.node).map(i => {
          return {
            name: i, 
            url: apiCalls[resolvedPath][i]?.map(n => matchUrlFromFunction(n))
          }
        })
      } else {
        const childApiRefs = findApiReferences(resolvedPath, apiCalls, srcDir);
        result.children[resolvedPath] = childApiRefs;
      }
    },
    CallExpression(path) {
      const callee = path.get('callee')
      // 动态 import
      if (callee.isImport()) {
        const source = path.get('arguments')[0].node.value;
        const resolvedPath = resolveModulePath(srcDir, filePath, source);
        if (resolvedPath === false) {
          return
        }
        if (!resolvedPath) {
          throw new Error('未找到模块路径');
        }
        const childApiRefs = findApiReferences(resolvedPath, apiCalls, srcDir);
        result.children[resolvedPath] = childApiRefs;
      }
    }
  });

  return result;
};