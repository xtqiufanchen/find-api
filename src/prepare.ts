import fs from 'fs';
import path from 'path';

export const prepare = () => {
  if (!fs.existsSync(path.resolve(__dirname, '.cache'))) {
    fs.mkdirSync(path.resolve(__dirname, '.cache'));
  }
  if (!fs.existsSync(path.resolve(__dirname, 'output'))) {
    fs.mkdirSync(path.resolve(__dirname, 'output'));
  }
}