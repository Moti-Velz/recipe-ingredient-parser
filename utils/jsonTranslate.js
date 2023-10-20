const csv = require('csv-parser');
const fs = require('fs');

const csvFilePath = 'recipeDB.csv';
let results = [];

fs.createReadStream(csvFilePath)
  .pipe(csv({
    trim: true
  }))
  .on('data', (data) => {
    
    for (const key in data) {
      if (data[key].startsWith('"[') && data[key].endsWith(']"')) {
        data[key] = parseComplexColumn(data[key]);
      }
    }
    results.push(data);
  })
  .on('end', () => {
    fs.writeFileSync('output.json', JSON.stringify(results, null, 4));
    console.log('CSV data has been converted to JSON format and saved to output.json.');
  });

function parseComplexColumn(str) {
    // Remove outer double quotes
    str = str.substring(1, str.length - 1);
    try {
        return JSON.parse(str);
    } catch (e) {
        console.error("Error parsing column: ", str);
        return [];
    }
}
