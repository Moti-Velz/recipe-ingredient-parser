const fs = require('fs');
const mysql = require('mysql');
require('dotenv').config();


function fractionToDecimal(fraction) {
  const unicodeFractions = {
    '¼': 0.25,
    '½': 0.5,
    '¾': 0.75,
    '⅔': 0.67,
    '⅓': 0.33

    // Add other Unicode fractions as needed
  };

  return unicodeFractions[fraction] || fraction;
}

const unitPattern = "Tbsp\\.?|cups?|tablespoons?|tsp\\.?|teaspoons?|oz\\.?|ounces?|slice|bar spoon|milliliters|small|medium|large|bunch|pound|16-ounce cans";
const magicB = new RegExp(`(?<amount>\\d+(\\.\\d+)?)?\\s*(?<unit>${unitPattern})?\\s*(?<ingredient>.+)`); // to be tested

const units = [
  "Tbsp\\.",
  "Tbsp",
  "cups",
  "cup",
  "tablespoons",
  "tablespoon",
  "tsp\\.",
  "tsp",
  "teaspoons",
  "teaspoon",
  "oz\\.",
  "oz",
  "ounces",
  "ounce",
  "slices",
  "slice",
  "bar spoon",
  "milliliters",
  "small",
  "medium",
  "large",
  "bunch",
  "pounds",
  "pound",
  "16-ounce cans"
].map(unit => unit.replace(".", "\\.")).join("|"); // escape any dots in the units
const basePattern = new RegExp(`^(?<amount>(\\d+\\s*(¼|½|¾|\\d*\\/\\d+)?)|(¼|½|¾|\\d*\\/\\d+)|\\d+)\\s*(?<unit>${units}\\.?)\\s*(\\((?<parenthesis>[^\\)]+)\\))?`);
const patternus = new RegExp(`^(?<amount>(\\d+\\s*)?(¼|½|¾|\\d*\\/\\d+)?|\\d+)?\\s*(?<unit>${units}\\.?)?(?=\\s|$)\\s*(\\((?<parenthesis>[^\\)]+)\\))?\\s*(?<ingredient>.+)$`);


// OG : const basePattern = new RegExp(`^(?<amount>(\\d+\\s*(¼|½|¾|\\d*\\/\\d+)?)|(¼|½|¾|\\d*\\/\\d+)|\\d+)\\s*(?<unit>${units}\\.?)`);
// const patternus = new RegExp(`^(?<amount>(\\d+\\s*to\\s*\\d+\\s*(¼|½|¾|\\d*\\/\\d+)?)|(\\d+\\s*)?(¼|½|¾|\\d*\\/\\d+))?(\\s*(?<unit>${units}))?(?=\\s|$)\\s*(?<ingredient>.+)$`);


// 1. Extract
function extractData(filePath) {
  const rawData = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(rawData);
}

// 2. Transform
function transformIngredients(cleanedIngredientsString) {
  const trimmedString = cleanedIngredientsString.slice(1, -1);
  const regex = /'([^']+)'/g;
  const ingredientsArray = [];

  let match;
  while ((match = regex.exec(trimmedString)) !== null) {
    ingredientsArray.push(match[1]);
  }

  return ingredientsArray;
}

function transformRecipe(recipe) {
  return {
    ...recipe,
    ingredients: transformIngredients(recipe.Cleaned_Ingredients)
  };
}


// 3. Load

async function load(data, connection) {
  const patterns = [
    /(?<amount>\d+(\.\d+)?)\s*(?<ingredient>.+)/,
    /(?<amount>\d+(\.\d+)?)\s*([a-zA-Z-]+)\s*(?<ingredient>.+)/,
    /(?<amount>\d+(\.\d+)?)\s*(small|medium|large)\s*(?<ingredient>.+)/,
    /(?<amount>\d+(\.\d+)?)\s*\(([^)]+)\)\s*(?<ingredient>.+)/,
    /(?<amount>\d+\/\d+|\d+|¼|½|¾)\s*(?<unit>[a-zA-Z-]*)\s*(?<ingredient>.+)/
  ];

  const ingredientCache = {};

  for (const recipe of data) {
    const transformedRecipe = transformRecipe(recipe);

    // console.log(transformedRecipe); //json objects with arrays of string as ingredients
    const insertRecipeQuery = "INSERT INTO Recipes (Title, Image_Name, Instructions) VALUES (?, ?, ?)";
    connection.query(insertRecipeQuery, [transformedRecipe.Title, transformedRecipe.Image_Name, transformedRecipe.Instructions], (err, result) => { //instructions dans un format bizarre ici
      if (err) throw err

      const recipeID = result.insertId;
      // console.log("Insertion de recette: " + recipeID)

      for (const ingredientStr of transformedRecipe.ingredients) {
        let matched = false

        for (const pattern of patterns) {
          let match = ingredientStr.match(basePattern);


          if (!match) {
            match = ingredientStr.match(patternus);
          }

          if (match) {
            const rawAmount = match.groups.amount || "N/A";
            const amount = rawAmount.trim();
            const unit = match.groups.unit || "N/A";
            var ingredientName = (match.groups.ingredient || ingredientStr).trim();

            if (rawAmount !== "N/A") {
              ingredientName = ingredientName.replace(rawAmount, '').trim();
            }
            if (unit !== "N/A") {
              ingredientName = ingredientName.replace(new RegExp('^' + unit.replace('.', '\\.') + '\\.?'), '').trim();
            }
            if (match.groups.parenthesis) {
              ingredientName = ingredientName.replace(`(${match.groups.parenthesis})`, '').trim();
            }

            console.log(`Matched ingredient string: "${ingredientStr}" => Amount: ${amount} , Unit: ${unit}, Ingredient: ${ingredientName}`);


            // console.log(`Current ingredientCache:`, JSON.stringify(ingredientCache, null, 2));
            //if not exist in cache, insert it in Ingredients table
            if (true) { //!ingredientCache[ingredientName]

              const insertIngredientQuery = "INSERT INTO Ingredients (Name) VALUES (?)"
              // console.log("Executing Query:", insertIngredientQuery);
              // console.log("Parameters:", [ingredientName]);
              connection.query(insertIngredientQuery, ingredientCache[ingredientName], (err, result) => {
                if (err) throw err
                ingredientCache[ingredientName] = result.insertId
                console.log(`Inserted ingredient "${ingredientName}" with ID: ${result.insertId} into Ingredients table. (line 148)`);

                // Insert in junction table
                
                const insertJunctionQuery = "INSERT INTO RecipeIngredients (RecipeID, IngredientID, Quantity) VALUES (?, ?, ?)"
                // console.log("Executing Query:", insertJunctionQuery);
                // console.log("Parameters:", ingredientCache[ingredientName]);
                connection.query(insertJunctionQuery, [recipeID, ingredientCache[ingredientName], amount], (err) => {
                  if (err) throw err
                  console.log(`Associated ingredient "${ingredientName}" with recipe ID: ${recipeID} in RecipeIngredients table. (line 157)`);
                });
              });
            } else {
              console.log(`Ingredient "${ingredientName}" already cached with ID: ${ingredientCache[ingredientName]}.`);
              // If ingredient already exists, just insert in junction table
              const insertJunctionQuery = "INSERT INTO RecipeIngredients (RecipeID, IngredientID, Quantity) VALUES (?, ?, ?)";
              connection.query(insertJunctionQuery, [recipeID, ingredientCache[ingredientName], amount], (err) => {
                if (err) throw err;
                console.log(`Associated ingredient "${ingredientName}" with recipe ID: ${recipeID} in RecipeIngredients table.`);
              });
            }
            // console.log(`Amount: ${amount}, Ingredient: ${ingredientName}`);
            matched = true;
            break;
          }
        }

        if (!matched) {
          console.warn(`No regex matched for ingredient: ${ingredientStr}`)
          const insertIngredientQuery = "INSERT INTO Ingredients (Name) VALUES (?)"
          connection.query(insertIngredientQuery, [ingredientStr], (err, result) => {
            if (err) throw err
            ingredientCache[ingredientStr] = result.insertId

            // Insert in junction table
            const insertJunctionQuery = "INSERT INTO RecipeIngredients (RecipeID, IngredientID, Quantity) VALUES (?, ?, ?)"
            connection.query(insertJunctionQuery, [recipeID, ingredientCache[ingredientStr], 'N/A'], (err) => {
              if (err) throw err
            });
          });
        }
      }
    });
  }
}
// Main Flow
const user = process.env.USER
const pwd =  process.env.PASSWORD
const host =  process.env.HOST

const data = extractData('data.json')
const connection = mysql.createConnection({
  host: host, //defaults to port 3306
  user: user,
  password: pwd,
  database: "recipes"
})

connection.connect()
load(data, connection)

