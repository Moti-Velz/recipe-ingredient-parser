const Papa = require('papaparse');
const fs = require('fs');
const createCsvWriter = require('fast-csv').write;
const output = [];


function parseIngredient(ingredient) {
    const fractions = {
        '½': 0.5,
        '¼': 0.25,
        '¾': 0.75,
        // ... add other Unicode fraction characters as needed
    };
    const numbersAsWords = {
        'one': 1,
        'two': 2,
        'three': 3
    };

    const pattern = /(?<amount>(\d+(\.\d+)?|one|two|three|[\d+\s*-to]+))?\s*(?<unit>Tbsp\.?|cups?|tablespoons?|tsp\.?|teaspoons?|oz\.?|ounces|slice|bar spoon|milliliters|small|medium|large|bunch|pound|16-ounce cans)?\s*(?<ingredient>.*)/i;

    const match = ingredient.match(pattern);
    if (match) {
        let amount = match.groups.amount || "";
        if (amount.includes('-') || amount.includes('to')) {
            const range = amount.split(/-|to/).map(val => parseFloat(val.trim()));
            amount = Math.max(...range);
        } else {
            // Handle whole number + fraction
            const parts = amount.split(/\s+/); // split on whitespace
            amount = parts.reduce((acc, part) => {
                if (fractions[part]) {
                    return acc + fractions[part];
                } else if (numbersAsWords[part.toLowerCase()]) {
                    return acc + numbersAsWords[part.toLowerCase()];
                } else {
                    return acc + parseFloat(part);
                }
            }, 0);
        }

        // base case
        return {
            amount: amount.toString(),
            unit: match.groups.unit || "",
            ingredient: match.groups.ingredient.trim()
        };
    }
    return null;
}

const file = fs.createReadStream('data.csv');

Papa.parse(file, {
    header: true,
    step: function(result) {
        const recipe = result.data;
        const ingredients = JSON.parse(recipe.Cleaned_Ingredients);

        ingredients.forEach((ingredient, idx) => {
            const parsed = parseIngredient(ingredient);
            if (parsed) {
                const measure = `${parsed.amount} ${parsed.unit} ${idx}`;
                const simple_ingredient = `${parsed.ingredient} ${idx}`;
                const newRow = {
                    ...recipe,
                    Measure: measure.trim(),
                    Simple_Ingredient: simple_ingredient.trim()
                };
                output.push(newRow);
            }
        });
    },
    complete: function() {
        const csvWriter = createCsvWriter({ path: 'dataOutput.csv', header: true });
        csvWriter.writeRecords(output)
            .then(() => console.log('The CSV file was written successfully'));
    }
});
