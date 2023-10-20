const fs = require('fs');
const mysql = require('mysql');

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
  "tablespoon",
  "tablespoons",
  "tsp\\.",
  "teaspoon",
  "teaspoons",
  "oz\\.",
  "ounces",
  "slice",
  "bar spoon",
  "milliliters",
  "small",
  "medium",
  "large",
  "bunch",
  "pound",
  "16-ounce cans",
  "tsp"
].map(unit => unit.replace(".", "\\.")).join("|"); // escape any dots in the units
const patternus = new RegExp(`^(?<amount>(\\d+\\s*)?(¼|½|¾|\\d*\\/\\d+)?|\\d+)?\\s*(?<unit>${units})?(?=\\s|$)\\s*(?<ingredient>.+)$`);


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

  for ( const recipe of data) {
    const transformedRecipe = transformRecipe(recipe);

    // console.log(transformedRecipe); //json objects with arrays of string as ingredients
    const insertRecipeQuery = "INSERT INTO Recipes (Title, Image_Name, Instructions) VALUES (?, ?, ?)";
    connection.query(insertRecipeQuery, [transformedRecipe.Title, transformedRecipe.Image_Name, transformedRecipe.Instructions], (err, result) => { //instructions dans un format bizarre ici
      if (err) throw err

      const recipeID = result.insertId;
      console.log(recipeID)

      for (const ingredientStr of transformedRecipe.ingredients) {
        let matched = false

        for (const pattern of patterns) {
            const match = ingredientStr.match(patternus)

            if (match) {
              const rawAmount = match.groups.amount || "N/A";
              const amount = fractionToDecimal(rawAmount) || "N/A";
              const unit = match.groups.unit || "N/A"; 
              const ingredientName = match.groups.ingredient.trim()

              console.log(`Matched ingredient string: "${ingredientStr}" => Amount: ${amount} , Unit: ${unit}, Ingredient: ${ingredientName}`);
              

              console.log(`Current ingredientCache:`, JSON.stringify(ingredientCache, null, 2));
              //if not exist in cache, insert it in Ingredients table
              if (!ingredientCache[ingredientName]) {
                const insertIngredientQuery = "INSERT INTO Ingredients (Name) VALUES (?)"
                connection.query(insertIngredientQuery, [ingredientName], (err, result) => {
                  if (err) throw err
                  ingredientCache[ingredientName] = result.insertId
                  console.log(`Inserted ingredient "${ingredientName}" with ID: ${result.insertId} into Ingredients table.`);

                  // Insert in junction table
                  const insertJunctionQuery = "INSERT INTO RecipeIngredients (RecipeID, IngredientID, Quantity) VALUES (?, ?, ?)"
                  connection.query(insertJunctionQuery, [recipeID, ingredientCache[ingredientName], amount], (err) => {
                    if (err) throw err
                    console.log(`Associated ingredient "${ingredientName}" with recipe ID: ${recipeID} in RecipeIngredients table.`);
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

const data = extractData('data.json')
const connection = mysql.createConnection({
  host: "database-tp-resto.canqn1eiz261.us-east-2.rds.amazonaws.com", //defaults to port 3306
  user: "admin",
  password: "gr007,,,",
  database: "recipes"
})

connection.connect()
load(data, connection)

