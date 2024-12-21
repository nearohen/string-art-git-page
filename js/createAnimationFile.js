const fs = require('fs');
const path = require('path');

/**
 * Processes .txt files in a directory and creates a JSON file with specific fields from the parsed JSON objects.
 * @param {string} directoryPath - Path to the directory containing .txt files.
 * @param {string[]} fields - Array of field names to copy from each JSON object.
 */
function processTxtFiles(directoryPath, fields) {
    let result = {
        sessions: []
    };

    // Read directory
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            console.error('Error reading directory:', err);
            return;
        }

        // Filter .txt files
        const txtFiles = files.filter(file => path.extname(file).toLowerCase() === '.txt');

        // Process each .txt file
        txtFiles.forEach(file => {
            const filePath = path.join(directoryPath, file);

            // Read file content
            const fileContent = fs.readFileSync(filePath, 'utf8');

            try {
                // Parse JSON content
                const jsonData = JSON.parse(fileContent);

                // Extract specified fields
                const extractedData = {};
                fields.forEach(field => {
                    if (jsonData.hasOwnProperty(field)) {
                        extractedData[field] = jsonData[field];
                    }
                });

                // Push the extracted data into the sessions array
                result.sessions.push(extractedData);
            } catch (parseError) {
                console.error(`Error parsing JSON in file ${file}:`, parseError);
            }
        });

        // Write result to output.json
        const outputPath = path.join(directoryPath, 'output.json');
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
        console.log(`JSON file created successfully at ${outputPath}`);
    });
}

// Example usage
const directoryPath = 'C:\\Users\\User\\Documents\\animationSessions'; // Replace with your directory path
const fields = ["version","pointsW","pointsH","pointsC","sourceWidth","sourceHeight","radius","circle","stringPixelRation","snapshotB64"]; // Replace with desired field names
processTxtFiles(directoryPath, fields);
