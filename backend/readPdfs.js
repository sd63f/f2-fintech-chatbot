const fs = require('fs');
const PDFParser = require('pdf2json');
const path = require('path');

function readPDF(filePath) {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser(this, 1);
        pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
        pdfParser.on("pdfParser_dataReady", pdfData => {
            resolve(pdfParser.getRawTextContent());
        });
        pdfParser.loadPDF(filePath);
    });
}

async function run() {
    const dir = '../';
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf'));
    for (const file of files) {
        console.log(`\n\n=== FILE: ${file} ===\n`);
        const text = await readPDF(path.join(dir, file));
        console.log(text.substring(0, 3000));
    }
}
run();
