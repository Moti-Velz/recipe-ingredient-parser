const fs = require('fs');

// Read the file
fs.readFile('output.json', 'utf8', (err, jsonString) => {
    if (err) {
        console.log("Error reading file:", err);
        return;
    }

    const recipes = JSON.parse(jsonString);

    // Modify the Cleaned_Ingredients field
    for (let recipe of recipes) {
        // Remove the external double quotes and parse the string to create an actual array
        const cleanedStr = recipe.Cleaned_Ingredients.slice(1, -1);
        recipe.Cleaned_Ingredients = JSON.parse(`[${cleanedStr}]`);
    }

    // Write the modified recipes to a new JSON file
    fs.writeFile('cleanedDB.json', JSON.stringify(recipes, null, 2), err => {
        if (err) {
            console.log("Error writing file:", err);
        } else {
            console.log("Successfully wrote to cleanedDB.json");
        }
    });
});
