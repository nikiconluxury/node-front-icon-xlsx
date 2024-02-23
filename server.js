require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const s3Client = new S3Client({
    endpoint: process.env.SPACES_ENDPOINT,
    region: process.env.REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Converts Excel column letters to a zero-based index for easier data manipulation
function columnLetterToIndex(columnLetter) {
    let column = 0;
    for (let i = 0; i < columnLetter.length; i++) {
        column += (columnLetter.toUpperCase().charCodeAt(i) - 64) * Math.pow(26, columnLetter.length - i - 1);
    }
    return column - 1; // Returns a zero-based index
}
function findHeaderRowIndex(worksheet, headerKeywords) {
    // Convert the worksheet to a JSON array
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: true, defval: null });
    const headerRowKeywords = headerKeywords.map(keyword => keyword.toUpperCase()); // Normalize keywords for case-insensitive comparison

    // Iterate through each row to find the header keywords
    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
        const row = data[rowIndex];
        for (let cell of row) {
            if (cell && headerRowKeywords.includes(cell.toString().toUpperCase())) {
                return rowIndex; // Return the current row index as the header row index
            }
        }
    }

    return -1; // Return -1 if no header row is found
}




app.post('/submitImage', upload.single('fileUploadImage'), async (req, res) => {
    try {
        console.log('Processing image submission...');
        console.log('Payload Received:', req.file); // Logs the payload details
        const fileBuffer = req.file.buffer;






        // Implement your validation logic here
        // For example, check if certain sheets exist or certain values are valid
        const isValid = false; // Placeholder validation result





        if (isValid) {
            const fileName = `${uuidv4()}-${req.file.originalname}`;
            await uploadFileToSpaces(fileBuffer, fileName); // Upload original file to S3

            console.log('File uploaded to S3 successfully.');
            res.json({ success: true, message: "File processed and uploaded successfully." });
        } else {
            res.status(400).json({ success: false, message: "File validation failed." });
        }
    } catch (error) {
        console.error("Error during file submission:", error);
        res.status(500).json({ success: false, message: "An unexpected error occurred.", error: error.toString() });
    }
});


app.post('/submitMsrp', upload.single('fileUploadMsrp'), async (req, res) => {
    let fileUrl = ''; // Initialize outside the try block
    console.log(`fileUrl initialized: ${fileUrl}`);
    try {
        console.log('Processing MSRP submission...');
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded." });
        }

        const fileBuffer = req.file.buffer;
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

        if (workbook.SheetNames.length > 1) {
            return res.status(400).json({ success: false, message: "Please ensure the Excel file contains only one sheet and re-upload." });
        }

        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const headerKeywords = ["BRAND", "COLOR", "MSRP", "QTY", "IMAGE", "PICTURE", "MODEL", "MATERIAL", "SKU", "PRICE", "SIZE","DESCRIPTION","DESIGNER","MATERIAL","COLOUR","TITLE", "ROW LABELS", "GRAND TOTAL"];
        
        const headerRowIndex = findHeaderRowIndex(worksheet, headerKeywords);
        if (headerRowIndex === -1) {
            return res.status(400).json({ success: false, message: "Header row not found. Please ensure the Excel file is formatted correctly." });
        }

        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: headerRowIndex + 1});//+1 to skip header row
        const searchColIndex = columnLetterToIndex(req.body.searchColMsrp);
        const brandColIndex = columnLetterToIndex(req.body.brandColMsrp);
        const msrpColIndex = columnLetterToIndex(req.body.msrpColumnMsrp);
        const validationErrors = [];

        let packagedData = []; // Prepare to package data

for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const absoluteRowIndex = i + headerRowIndex + 2; // Adjust for zero-based index and header row
    
    // Define these variables outside of the rowData object to use them in conditional checks
    const searchValue = row[searchColIndex];
    const brandValue = row[brandColIndex];
    const msrpValue = row[msrpColIndex];

    // Now use searchValue, brandValue, and msrpValue in your if conditions
    if (req.body.preferredMsrpMethod === 'append' && msrpValue !== undefined) {
        if (searchValue === undefined || brandValue === undefined) {
            validationErrors.push(`Row ${i + 1 + headerRowIndex}: Missing brand or search value where MSRP is intended to be appended.`);
        }
        continue; // Skip appending this row to packagedData if it's not missing MSRP
    }
    if (searchValue === undefined) validationErrors.push(`Row ${i + 1 + headerRowIndex}: Missing search value.`);
    else if (searchValue.length < 8) {
        validationErrors.push(`Row ${i + 1 + headerRowIndex}: Search value length must be at least 3 characters.`);
    }
    if (brandValue === undefined) validationErrors.push(`Row ${i + 1 + headerRowIndex}: Missing brand value.`);
    else if (brandValue.length < 3) {
        validationErrors.push(`Row ${i + 1 + headerRowIndex}: Brand value length must be at least 3 characters.`);
    }
    
    // Construct the rowData object using the variables defined above
    const rowData = {
        absoluteRowIndex,
        searchValue,
        brandValue,
        msrpValue,
    };

    // For simplicity, we're packaging all rows directly
    packagedData.push(rowData);
}


        if (validationErrors.length > 0) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: validationErrors });
        }
        console.log('Packaged data:', packagedData);
        console.log('Data packaged successfully:', packagedData.length, 'rows packaged.');

        // Upload the original file to S3
        const fileName = `${uuidv4().slice(0, 8)}-${req.file.originalname}`.replace(/\s/g, '');
        await s3Client.send(new PutObjectCommand({
            Bucket: process.env.SPACES_BUCKET_NAME,
            Key: fileName,
            Body: fileBuffer,
            ACL: 'public-read',
        }));
        const fileUrl = `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET_NAME}/${fileName}`;
        console.log('File uploaded to S3 successfully:', fileUrl);

        // Attempt to send packaged data to another service
        const serviceResponse = await sendPackagedDataToService(packagedData);
        console.log(serviceResponse.message);
        res.json({ success: true, message: "File processed and uploaded successfully, data packaged for batch processing and sent.", fileUrl, serviceMessage: serviceResponse.message });
    } catch (error) {
        // Check if the error is from sendPackagedDataToService
        if (error.message === 'Failed to process data by the external service.') {
            console.error("Error during external service processing:", error.message);
            // Return a more specific error message related to the external service failure
            return res.status(500).json({ success: false, message: "File processed and uploaded, but failed during external service processing.", error: error.message, fileUrl });
        } else {
            // Handle other errors that might have occurred during request processing
            console.error("Error during MSRP submission:", error);
            res.status(500).json({ success: false, message: "An unexpected error occurred.", error: error.toString() });
        }
    }
});
// Simulates sending packaged data to another service
function sendPackagedDataToService(packagedData) {
    return new Promise((resolve, reject) => {
        // Simulate a request to an external service
        const isSuccess = Math.random() > 0; //0.5 =  50% chance of success

        setTimeout(() => {
            if (isSuccess) {
                resolve({ success: true, message: "Data processed successfully by the external service." });
            } else {
                reject({ success: false, message: "Failed to process data by the external service." });
            }
        }, 1000); // Simulate async operation delay
    });
}

//BELOW WORKS FEB 22 10pm
// app.post('/submitMsrp', upload.single('fileUploadMsrp'), async (req, res) => {
//     try {
//         console.log('Processing MSRP submission...');
//         if (!req.file) {
//             return res.status(400).json({ success: false, message: "No file uploaded." });
//         }

//         const fileBuffer = req.file.buffer;
//         const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

//         if (workbook.SheetNames.length > 1) {
//             return res.status(400).json({ success: false, message: "Please ensure the Excel file contains only one sheet and re-upload." });
//         }

//         const worksheet = workbook.Sheets[workbook.SheetNames[0]];
//         const headerKeywords = ["BRAND", "COLOR", "MSRP", "QTY", "IMAGE", "PICTURE", "MODEL", "MATERIAL", "SKU", "PRICE", "DESCRIPTION", "TITLE", "ROW LABELS", "GRAND TOTAL"];
        
//         // Assuming findHeaderRowIndex function is defined and working as expected
//         const headerRowIndex = findHeaderRowIndex(worksheet, headerKeywords);
//         console.log('Header row index:', headerRowIndex);
//         if (headerRowIndex === -1) {
//             return res.status(400).json({ success: false, message: "Header row not found. Please ensure the Excel file is formatted correctly." });
//         }

//         const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: headerRowIndex });

//         const searchColIndex = columnLetterToIndex(req.body.searchColMsrp);
//         const brandColIndex = columnLetterToIndex(req.body.brandColMsrp);
//         const msrpColIndex = columnLetterToIndex(req.body.msrpColumnMsrp);
//         const validationErrors = [];

//         if (searchColIndex < 0 || brandColIndex < 0 || msrpColIndex < 0) {
//             validationErrors.push("Invalid column letter provided for search, brand, or MSRP.");
//         }

//         for (let i = 1; i < data.length; i++) { // Skip header row in data processing
//             const row = data[i];
//             const searchValue = row[searchColIndex];
//             const brandValue = row[brandColIndex];
//             const msrpValue = row[msrpColIndex];

            //  if (req.body.preferredMsrpMethod === 'append' && msrpValue !== undefined) {
            //      if (searchValue === undefined || brandValue === undefined) {
            //          validationErrors.push(`Row ${i + 1 + headerRowIndex}: Missing brand or search value where MSRP is intended to be appended.`);
            //      }
            //      continue;
            //  }
            //  if (searchValue === undefined) validationErrors.push(`Row ${i + 1 + headerRowIndex}: Missing search value.`);
            //  if (brandValue === undefined) validationErrors.push(`Row ${i + 1 + headerRowIndex}: Missing brand value.`);
//             // Add more specific validations as needed
//         }

//         if (validationErrors.length > 0) {
//             return res.status(400).json({ success: false, message: "Validation failed", errors: validationErrors });
//         }
//         let fileName = `${uuidv4()}-${req.file.originalname}`.replace(/\s/g, '')
//         const uploadS3Command = new PutObjectCommand({
//             Bucket: process.env.SPACES_BUCKET_NAME,
//             Key: fileName,
//             Body: fileBuffer,
//             ACL: 'public-read',
//         });
//         await s3Client.send(uploadS3Command);
//         fileUrl = `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET_NAME}/${fileName}`;
//         console.log('File uploaded to S3 successfully. ', fileUrl);
//         res.json({ success: true, message: "File processed and uploaded successfully." });

//     } catch (error) {
//         console.error("Error during MSRP submission:", error);
//         res.status(500).json({ success: false, message: "An unexpected error occurred.", error: error.toString() });
//     }
// });
 


const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
