import path from 'path';
import fs from 'fs';
import { findAllApi } from './findAllApi'
import { findApiReferences } from './findApiReference';
import { saveJson, clearObjectWithEmpty, caculateApiCount, importExcel } from './utils';
import { prepare } from './prepare';

const projectRoot = '/Users/xt02755/Desktop/Code/mfe-boss-magpiebridge/client/'
const entryFile = path.join(projectRoot, 'view/customerservice/serviceOrder/components/SalesPlans/index.vue');

// Step0: 预备工作
prepare()

// Step1: 解析所有文件，找出所有定义api的方法与文件的映射
const [ apiCalls, unExportRequest ]= findAllApi(projectRoot);

// Step2: 从入口文件出发，找出所有调用的api
const result = findApiReferences(entryFile, apiCalls, projectRoot)
// clearObjectWithEmpty(result)
saveJson(path.resolve(__dirname, 'output', 'result.json'), result);
importExcel(result, projectRoot)
// console.log(result)
console.log(caculateApiCount(result))