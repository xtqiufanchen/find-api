import * as t from "@babel/types";
import fs from "fs";
import { parse as vueParse } from "@vue/compiler-sfc";
import * as babel from "@babel/parser";
import path from "path";
import prettier from "prettier";
import XLSX from "xlsx";

/** 获取 import 了哪些 */
export const getImportSpecifiers = (node: t.ImportDeclaration) => {
  return node.specifiers.map((specifier) => {
    return specifier.local.name;
  });
};

/**
 * 将 .vue,.ts,.tsx,.js 文件转为 AST
 */
export const getAst = (filePath: string) => {
  console.log(filePath, "filePath");

  let content = fs.readFileSync(filePath, "utf-8");
  // 使用 Babel 解析源代码

  if (filePath.includes(".vue")) {
    const sfcParseResult = vueParse(content);

    content =
      (sfcParseResult.descriptor.script?.content as string) ||
      (sfcParseResult.descriptor.scriptSetup?.content as string);
    if (!content) {
      return babel.parse("const a = 1", {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
      });
    }
  }
  try {
    return babel.parse(content, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
  } catch {
    return false
  }
};

export const skippedImport = new Set()
export const resolveModulePath = (
  srcDir: string,
  currentFile: string,
  importPath: string
): string | false | null => {
  let resolvedPath: string | null = importPath;
  if (!resolvedPath.startsWith(".") && !resolvedPath.startsWith("@/") && !resolvedPath.startsWith("@src") && !resolvedPath.startsWith("/@/")) {
    const rootDir = path.resolve(srcDir, "..");
    resolvedPath = resolvedPath.split("/")[0];
    // 认为是node_modules
    skippedImport.add(resolvedPath)
    return false
    // if (/^[a-zA-z]/.test(importPath)) {
    //   return false;
    // } else {
    //   if (importPath === "idx" || importPath.includes("lodash")) {
    //     // idx解析不到。。。
    //     return false;
    //   }
    //   throw new Error(`未找到模块路径: ${importPath}`);
    // }
  }

  // 处理路径别名
  if (resolvedPath.startsWith("/@/")) {
    resolvedPath = path.join(srcDir, resolvedPath.slice(3));
  }
  if (resolvedPath.startsWith("@src")) {
    resolvedPath = path.join(srcDir, resolvedPath.slice(4));
  }
  if (resolvedPath.startsWith("@")) {
    resolvedPath = path.join(srcDir, resolvedPath.slice(1));
  }

  // 处理可能的相对路径
  if (importPath.startsWith(".")) {
    resolvedPath = path.resolve(path.dirname(currentFile), importPath);
  }

  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
    if (
      [".png", ".less", ".svg", ".jpeg", ".css", ".d.ts"].includes(
        path.extname(resolvedPath)
      )
    ) {
      return false;
    }
    return resolvedPath;
  }
  const extensions = [".js", ".ts", ".tsx", ".vue", ".jsx"];
  for (const ext of extensions) {
    if (fs.existsSync(resolvedPath + ext)) {
      resolvedPath = resolvedPath + ext;
      break;
    }
  }
  for (const ext of extensions.map((ext) => "/index" + ext)) {
    if (fs.existsSync(resolvedPath + ext)) {
      resolvedPath = resolvedPath + ext;
      break;
    }
  }

  return resolvedPath;
};

export const saveJson = async (filePath: string, data: any) => {
  const formatted = await prettier.format(JSON.stringify(data, null, 2), {
    parser: "json",
  });
  return fs.writeFileSync(filePath, formatted);
};

// 从函数ast字符串中提取到url相关内容
export const matchUrlFromFunction = (functionStrting: string) => {
  // url: '/boss/api/sensitive/batch-decryption/${code}'

  if (functionStrting.match(/url: '.+'/)) {
    return functionStrting
      .match(/url: '.+'/)?.[0]
      ?.replace(/url: '/, "")
      ?.replace(/'/, "");
  }

  // url: `/boss/api/sensitive/batch-decryption/${code}`

  if (functionStrting.match(/url: `[^`]+`/)) {
    return functionStrting
      .match(/url: `[^`]+`/)?.[0]
      ?.replace(/url: `/, "")
      ?.replace(/`/, "");
  }
};

// 删除所有属性值api或者属性值children的值为空对象的对象
export const clearObjectWithEmpty = (obj: Record<string, any>) => {
  if (obj && obj.children) {
    Object.keys(obj.children).forEach((key) => {
      if (!obj.children[key]) {
        delete obj.children[key];
      }
      if (obj.children[key]) {
        const value = obj.children[key];
        clearObjectWithEmpty(value);
        const hasApi = value.api && Object.keys(value.api).length > 0;
        const hasChildren =
          value.children && Object.keys(value.children).length > 0;
        if (!hasApi && !hasChildren) delete obj.children[key];
      }
    });
  }
};

// 计算api的数量
export const caculateApiCount = (obj: Record<string, any>) => {
  let count = 0;

  const loop = (obj: Record<string, any>) => {
    if (obj && obj.children) {
      Object.keys(obj.children).forEach((key) => {
        if (obj.children[key]) {
          const value = obj.children[key];
          loop(value);
          count =
            count +
            (value.api
              ? Object.keys(value.api).reduce(
                  (t, i) => t + value.api[i].length,
                  0
                )
              : 0);
        }
      });
    }
  };

  loop(obj);

  return count;
};

export const flatAllApi = (obj: Record<string, any>) => {
  const result = [];

  const loop = (obj: Record<string, any>, index: number = 0) => {
    if (obj && obj.children) {
      Object.keys(obj.children).forEach((key) => {
        const value = obj.children[key];
        if (value && value.api) {
          Object.keys(value.api).forEach((apikey) => {
            value.api[apikey].forEach((i) => {
              result.push({
                接口API路径: i.url,
                层级: index,
                业务文件路径: key,
                接口函数名称: i.name,
                接口文件路径: apikey,

              });
            });
          });
        }
        loop(obj.children[key], index + 1);
      });
    }
  };

  loop(obj);

  return result;
};

export const importExcel = (obj: Record<string, any>, excludePath: string) => {
  const result = flatAllApi(obj).map((i) => {
    return {
      ...i,
      业务文件路径: i.业务文件路径.replace(excludePath, ""),
      接口文件路径: i.接口文件路径.replace(excludePath, ""),
    };
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(result);

  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, path.resolve(__dirname, "./output/result.xlsx"));
};
