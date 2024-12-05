import path from 'path';
import fs from 'fs';
import { findAllApi } from './findAllApi'
import { findApiReferences } from './findApiReference';
import { saveJson, clearObjectWithEmpty, caculateApiCount, importExcel, skippedImport } from './utils';
import { prepare } from './prepare';

const projectRoot = '/Users/chenqiufan/work/mfe-boss-customerfund-react/'
const entryFilePath =  '/src/pages/FxManagement/FxTHB/Manage.tsx'


const projectSrc = path.resolve(projectRoot, 'src')
const projectClient = path.resolve(projectRoot, 'client')

const finalProjectSrc = fs.existsSync(projectSrc) ? projectSrc : fs.existsSync(projectClient) ? projectClient : projectRoot
const fullEntryFilePath = path.join(projectRoot, entryFilePath)

// Step0: 预备工作
prepare()

// Step1: 解析所有文件，找出所有定义api的方法与文件的映射
const [ apiCalls, unExportRequest ]= findAllApi(finalProjectSrc);

// Step2: 从入口文件出发，找出所有调用的api
const result = findApiReferences(fullEntryFilePath, apiCalls, finalProjectSrc)
// clearObjectWithEmpty(result)
saveJson(path.resolve(__dirname, 'output', 'result.json'), result);
importExcel(result, finalProjectSrc, fullEntryFilePath)
// console.log(result)
console.log(caculateApiCount(result))
console.log('未导出的请求', unExportRequest)
console.log('忽略的模块', skippedImport)