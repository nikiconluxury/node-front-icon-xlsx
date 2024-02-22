require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const XLSX = require('xlsx');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize S3 client for DigitalOcean Spaces
const s3Client = new S3Client({
    endpoint: process.env.SPACES_ENDPOINT,
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Reads Excel file from buffer
function readExcelFile(fileBuffer) {
    console.log('Reading Excel file...');
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    console.log('Excel file read successfully');
    return workbook;
}

// Converts column letter to zero-based index
function columnLetterToIndex(columnLetter) {
    let column = 0;
    for (let i = 0; i < columnLetter.length; i++) {
        column += (columnLetter.toUpperCase().charCodeAt(i) - 64) * Math.pow(26, columnLetter.length - i - 1);
    }
    return column - 1;
}

// Dynamically constructs validation rules from the request
function constructValidationRules(req) {
    let validationRules = {};
    // Example: Assume each column input field is named with a pattern like "columnType_ColumnName"
    Object.entries(req.body).forEach(([key, value]) => {
        if (key.startsWith('columnType_')) {
            const column = key.split('_')[1].toUpperCase();
            const type = value; // "text" or "numeric"
            const method = req.body[`method_${column}`] || 'overwrite'; // Default method
            validationRules[column] = { type, method };
        }
    });
    return validationRules;
}

// Extracts and validates data based on dynamically constructed rules
function extractAndValidateData(workbook, validationRules) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    let data = [];
    let validationErrors = [];

    Object.entries(validationRules).forEach(([column, { type, method }]) => {
        const colIndex = columnLetterToIndex(column);
        console.log(`Processing column: ${column} (${colIndex}) with type ${type} and method ${method}`);

        for (let rowNum = range.s.r + 1; rowNum <= range.e.r; ++rowNum) {
            const cellRef = XLSX.utils.encode_cell({ c: colIndex, r: rowNum });
            const cell = sheet[cellRef];
            let value = cell ? cell.v : null;

            // Method-specific logic
            if (method === 'append' && value !== null) continue;

            // Validation based on type
            let isValid = (type === 'text' && /^[a-zA-Z0-9 ]*$/.test(value)) ||
                          (type === 'numeric' && /^[\d,.€$]*$/.test(value));

            if (!isValid) {
                validationErrors.push(`Row ${rowNum}, Column ${column}: Invalid data '${value}' for type ${type}.`);
                continue;
            }

            if (!data[rowNum]) data[rowNum] = {};
            data[rowNum][column] = value;
        }
    });

    console.log(`Extracted data:`, JSON.stringify(data, null, 2));
    if (validationErrors.length > 0) {
        console.log("Validation errors found:", validationErrors);
    }
    return { data, validationErrors };
}

// Main route for processing uploads
app.post('/submit', upload.fields([
    { name: 'fileUploadImage', maxCount: 1 },
    { name: 'fileUploadMsrp', maxCount: 1 }
]), async (req, res) => {
    try {
        const validationRules = constructValidationRules(req);
        console.log('Validation rules constructed:', validationRules);

        for (const fileType of ['fileUploadImage', 'fileUploadMsrp']) {
            if (req.files[fileType] && req.files[fileType].length > 0) {
                const file = req.files[fileType][0];
                const workbook = readExcelFile(file.buffer);
                const { data, validationErrors } = extractAndValidateData(workbook, validationRules);

                if (validationErrors.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Data validation errors encountered",
                        errors: validationErrors
                    });
                }

                // Further processing, e.g., uploading to S3, can go here
            } else {
                console.log(`No files to process for ${fileType}.`);
            }
        }

        return res.json({ success: true, message: "Files processed successfully" });
    } catch (error) {
        console.error("An unexpected error occurred:", error);
        return res.status(500).json({ success: false, message: "An unexpected error occurred processing your submission.", error: error.toString() });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
