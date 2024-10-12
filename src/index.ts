import path from 'path';
import { findAllApi } from './findAllApi'
import { findApiReferences } from './findApiReference';
import { saveJson } from './utils';

const projectRoot = '/Users/chenqiufan/work/mfe-boss-magpiebridge/client'
const entryFile = path.join(projectRoot, 'view/magpieBridge/followUpTask/followUpWorkbentch/index.vue');
// Step1: 解析所有文件，找出所有定义api的方法与文件的映射
const [ apiCalls, unExportRequest ]= findAllApi(projectRoot);

// Step2: 从入口文件出发，找出所有调用的api
const result = findApiReferences(entryFile, apiCalls, projectRoot)
saveJson(path.resolve(__dirname, 'output', 'result.json'), result);
console.log(result)