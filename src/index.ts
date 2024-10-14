import path from 'path';
import fs from 'fs';
import { findAllApi } from './findAllApi'
import { findApiReferences } from './findApiReference';
import { saveJson, clearObjectWithEmpty, caculateApiCount, importExcel, skippedImport } from './utils';
import { prepare } from './prepare';

const projectRoot = '/Users/chenqiufan/work/mfe-boss-magpiebridge-react/src/'
const entryFile = path.join(projectRoot, '/pages/SalesTask/SalesTaskSetting.tsx');
// const projectRoot = '/Users/chenqiufan/work/mfe-boss-operation-react/src'
// const entryFile = path.join(projectRoot, '/pages/Notification/ReceiptTemplateManagement/index.tsx');
// const projectRoot = '/Users/chenqiufan/work/bossfrontend/client'
// const entryFile = path.join(projectRoot, 'view/businessApply/permissionApply/PermissionMannage.vue');

// const projectRoot = '/Users/chenqiufan/work/mfe-boss-magpiebridge/client/'
// const entryFile = path.join(projectRoot, 'view/customerservice/serviceOrder/components/SalesPlans/index.vue');

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
console.log('未导出的请求', unExportRequest)
console.log('忽略的模块', skippedImport)