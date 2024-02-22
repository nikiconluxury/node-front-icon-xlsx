require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const XLSX = require('xlsx');

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
app.use(express.static('public'));

function readExcelFile(fileBuffer) {
    console.log('Reading Excel file...');
    const workbook = XLSX.read(fileBuffer, {type: 'buffer'});
    return workbook;
}

function columnLetterToIndex(columnLetter) {
    let column = 0, length = columnLetter.length;
    for (let i = 0; i < length; i++) {
        column += (columnLetter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
    }
    return column - 1; // Convert to zero-based index
}


function validateWorkbook(workbook, requiredColumnsLetters) {
    console.log(`Validating workbook against required columns: ${requiredColumnsLetters}`);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const range = XLSX.utils.decode_range(worksheet['!ref']); // Gets the range of the worksheet

    requiredColumnsLetters.forEach(letter => {
        const columnIndex = columnLetterToIndex(letter) - 1; // Convert letter to zero-based index
        if (columnIndex > range.e.c) { // range.e.c is the last column index (zero-based)
            console.log(`Missing required column: ${letter}`);
            throw new Error(`Missing required column: ${letter}`);
        }
    });

    console.log('Workbook validation passed for column presence.');
}

function validateDataRow(row, columnRules) {
    const errors = [];
    Object.keys(row).forEach(column => {
        const value = row[column];
        const rule = columnRules[column];
        if (rule) {
            if (rule === 'numeric' && !/^[\d,.€$]*$/.test(value)) {
                errors.push(`Invalid numeric format in column ${column}`);
            } else if (rule === 'text' && !/^[a-zA-Z0-9 ]*$/.test(value)) {
                errors.push(`Illegal character found in column ${column}`);
            }
        }
    });
    return errors;
}

function extractData(workbook, columnsToExtract, methodPreferences) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    let data = [];
    let validationErrors = [];

    // Define your validation rules here
    const validationRules = {
        'searchColImage': { type: 'text' },
        'brandColImage': { type: 'text' },
        'imageColumnImage': { type: 'text', method: methodPreferences.preferredImageMethod },
        'searchColMsrp': { type: 'text' },
        'brandColMsrp': { type: 'text' },
        'msrpColumnMsrp': { type: 'numeric', method: methodPreferences.preferredMsrpMethod }
    };

    columnsToExtract.forEach(column => {
        const colIndex = columnLetterToIndex(column);
        console.log(`Processing column: ${column} (${colIndex})`);

        for (let rowNum = sheet['!range'].s.r + 1; rowNum <= sheet['!range'].e.r; ++rowNum) {
            const cellAddress = XLSX.utils.encode_cell({ c: colIndex, r: rowNum });
            const cell = sheet[cellAddress];
            let value = cell ? cell.v : null;

            // Apply method-specific logic (e.g., skip rows for 'append' if value exists)
            if (validationRules[column].method === 'append' && value !== null) continue;

            // Validation
            if (value !== null && !validateValue(value, validationRules[column].type)) {
                validationErrors.push(`Invalid data at ${column}${rowNum + 1}: ${value}`);
                continue; // Skip adding invalid data
            }

            // Add data to your structure, respecting 'newColumn' or 'overwrite' as needed
            // This is a simplified example, adjust according to your data structure
            if (!data[rowNum]) data[rowNum] = {};
            data[rowNum][column] = value;
        }
    });

    // Debug: Log validation errors if any
    if (validationErrors.length > 0) {
        console.log("Validation errors found:", validationErrors);
    }
    console.log(`Extracted data for columns: ${columnsToExtract.join(', ')}:`, JSON.stringify(data, null, 2));
    return { data, validationErrors };
}
function getRequiredColumns(req, fileType) {
    let columns = [];
    if (fileType === 'fileUploadImage') {
        if (req.body.searchColImage) columns.push(req.body.searchColImage.toUpperCase());
        if (req.body.brandColImage) columns.push(req.body.brandColImage.toUpperCase());
        if (req.body.imageColumnImage) columns.push(req.body.imageColumnImage.toUpperCase());
    } else if (fileType === 'fileUploadMsrp') {
        if (req.body.searchColMsrp) columns.push(req.body.searchColMsrp.toUpperCase());
        if (req.body.brandColMsrp) columns.push(req.body.brandColMsrp.toUpperCase());
        if (req.body.msrpColumnMsrp) columns.push(req.body.msrpColumnMsrp.toUpperCase());
    }
    return columns;
}

// Validate value according to type
function validateValue(value, type) {
    if (type === 'text') return /^[a-zA-Z0-9 ]*$/.test(value);
    if (type === 'numeric') return /^[\d,.€$]*$/.test(value);
    return false; // Default case if type is not recognized
}


app.post('/submit', upload.fields([
    { name: 'fileUploadImage', maxCount: 1 },
    { name: 'fileUploadMsrp', maxCount: 1 }
]), async (req, res) => {
    const errors = [];
    const responses = [];

    for (const fileType of ['fileUploadImage', 'fileUploadMsrp']) {
        if (req.files[fileType] && req.files[fileType].length > 0) {
            const file = req.files[fileType][0];
            const workbook = readExcelFile(file.buffer);

            // Dynamic extraction of columns based on fileType
            const columnsToExtract = [
                req.body.searchColImage?.toUpperCase(),
                req.body.brandColImage?.toUpperCase(),
                req.body.imageColumnImage?.toUpperCase(),
                req.body.searchColMsrp?.toUpperCase(),
                req.body.brandColMsrp?.toUpperCase(),
                req.body.msrpColumnMsrp?.toUpperCase()
            ].filter(Boolean);

            const requiredColumns = getRequiredColumns(req, fileType);

            try {
                validateWorkbook(workbook, requiredColumns);
            } catch (error) {
                console.error(error);
                return res.status(400).json({
                    success: false,
                    message: `Validation failed for ${fileType}: ${error.message}. Please check your columns and try again.`
                });
            }
            
            const { data, validationErrors } = extractData(workbook, columnsToExtract, {
                preferredImageMethod: req.body.preferredImageMethod,
                preferredMsrpMethod: req.body.preferredMsrpMethod
            });

            if (validationErrors.length > 0) {
                errors.push(...validationErrors.map(error => ({ fileType, message: error })));
                continue;
            }

            const fileUrl = await uploadFileToSpaces(file, fileType);
            responses.push({ fileType, fileUrl, data });
        } else {
            console.log(`No files to process for ${fileType}.`);
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    return res.json({ success: true, message: "Files processed successfully", responses });
});



// app.post('/submit', upload.fields([
//     { name: 'fileUploadImage', maxCount: 1 },
//     { name: 'fileUploadMsrp', maxCount: 1 }
// ]), async (req, res) => {
//     try {
//         // Normalize column letters to uppercase
//         const columnsToExtract = [
//             req.body.searchColImage?.toUpperCase(),
//             req.body.brandColImage?.toUpperCase(),
//             req.body.imageColumnImage?.toUpperCase(),
//             req.body.searchColMsrp?.toUpperCase(),
//             req.body.brandColMsrp?.toUpperCase(),
//             req.body.msrpColumnMsrp?.toUpperCase()
//         ].filter(Boolean);
//         const responses = [];

//         for (const fileType of ['fileUploadImage', 'fileUploadMsrp']) {
//             console.log(`Processing ${fileType}...`);
//             if (req.files[fileType] && req.files[fileType].length > 0) {
//                 const file = req.files[fileType][0];
//                 const workbook = readExcelFile(file.buffer);

//                 // Determine required columns based on fileType
//                 const requiredColumns = [
//                     req.body.searchColImage || req.body.searchColMsrp,
//                     req.body.brandColImage || req.body.brandColMsrp,
//                     req.body.imageColumnImage || req.body.msrpColumnMsrp


//                 ].filter(Boolean); // Assuming these are column letters like 'D', 'R', 'Q'

//                 try {
//                     validateWorkbook(workbook, requiredColumns);
//                 } catch (validationError) {
//                     console.error(validationError.message);
//                     // Respond with the specific validation error
//                     return res.status(400).json({
//                         success: false,
//                         message: `Validation failed for ${fileType}: ${validationError.message}`
//                     });
//                 }

//                 const data = extractData(workbook, requiredColumns);

//                 // Log extracted data in a pretty format
//                 console.log(`Extracted data for ${fileType}:`, JSON.stringify(data, null, 2));

//                 // Upload original file to DigitalOcean Spaces
//                 const fileExtension = path.extname(file.originalname);
//                 const filename = `${uuidv4()}${fileExtension}`;
//                 console.log(`Uploading ${fileType} to DigitalOcean Spaces...`);
//                 await s3Client.send(new PutObjectCommand({
//                     Bucket: process.env.SPACES_BUCKET_NAME,
//                     Key: filename,
//                     Body: file.buffer,
//                     ACL: 'public-read',
//                 }));

//                 const fileUrl = `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET_NAME}/${filename}`;
//                 console.log(`${fileType} uploaded: ${fileUrl}`);

//                 responses.push({
//                     fileType: fileType,
//                     fileUrl: fileUrl,
//                     data: data,
//                 });
//             } else {
//                 console.log(`No files to process for ${fileType}.`);
//             }
//         }

//         console.log('All files processed.');
//         return res.json({ success: true, message: "Files processed", data: responses });
//     } catch (error) {
//         console.error("An unexpected error occurred:", error);
//         return res.status(500).send("An unexpected error occurred processing your submission.");
//     }
// });

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
