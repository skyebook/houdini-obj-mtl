/**
Houdini export includes OBJ's and PNG textures, but no MTL file

This script generates a very simple diffuse texture definition and inserts its
usage in the OBJ.
 */

const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const util = require('util');
const copyFile = util.promisify(fs.copyFile);

const program = require('commander');
const LineTransformStream = require('line-transform-stream');


let sourceValue = '';
let destValue = '';
program.description('Create material definitions (MTL) and modified OBJ files for a folder of Houdini-exported OBJ\'s').arguments('<source> <dest>').action((src, dst) => {
  sourceValue = src;
  destValue = dst;
}).option('--texture-prefix <type>', 'Prefix of texture filenames', '');

program.parse(process.argv);

const contents = fs.readdirSync(sourceValue);
const filteredContents = contents.filter((p) => p.endsWith('.obj'));
console.log(`Found ${filteredContents.length} OBJ's`);

const texturePrefix = program.texturePrefix;

// console.log(filteredContents);

mkdirp.sync(destValue);

const doSingle = async (filename) => {

  const file = `${sourceValue}/${filename}`;
  const meshExtension = '.obj';
  const textureExtension = '.png';
  const mtlName = `${path.basename(file)}.mtl`;

  // Text to insert in OBJ before faces start
  const useInclude = `s off\nusemtl textureMaterial`;

  // Create text to put in MTL file
  let name = path.basename(filename, meshExtension);
  const textureName = `${texturePrefix}${name}${textureExtension}`;
  const mtlText = `newmtl textureMaterial\nmap_Kd ${textureName}`;

  const copyPromise = copyFile(`${sourceValue}/${textureName}`, `${destValue}/${textureName}`);

  let putMtlLib = false;
  let putMtlUse = false;

  let lastLineFirstChar = null;
  const filter = new LineTransformStream((line) => {
    let lineToReturn = line;

    // Find first non-comment line
    if (!putMtlLib && lastLineFirstChar === '#' && !line.startsWith('# ')) {
      lineToReturn = `mtllib ${mtlName}\n${line}`;
      putMtlLib = true;
    }

    // Find first face entry and pre-empt it with our material usage
    if (!putMtlUse && lastLineFirstChar !== 'f' && !line.startsWith('f ')) {
      lineToReturn = `${useInclude}\n${line}`;
      putMtlUse = true;
    }

    lastLineFirstChar = line.substr(0, 1);

    return lineToReturn;
  });

  const objReadStream = fs.createReadStream(`${file}.obj`);

  const file2 = `${destValue}/${filename}`;
  const objWriteStream = fs.createWriteStream(`${file2}.obj`);
  const mtlWriteStream = fs.createWriteStream(`${file2}.mtl`);

  objReadStream.pipe(filter).pipe(objWriteStream);

  mtlWriteStream.write(Buffer.from(mtlText));

  const writePromise = new Promise((resolve, reject) => {

    objWriteStream.on('close', () => {
      console.log(`obj write closed`);
      resolve();
    });
  });

  return Promise.all([copyPromise, writePromise]);
};

const processFiles = async () => {
  for (let filename of filteredContents) {
    console.log(`Hello ${filename}`);
    await doSingle(path.basename(filename, '.obj'));
    console.log(`Processed ${filename}`);
  }
};

try {
  processFiles().then(() => console.log('done'));
} catch (err) {
  console.log(err);
}
