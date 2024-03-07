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
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows : true ,defval: null });
    const headerRowKeywords = headerKeywords.map(keyword => keyword.toUpperCase().trim()); // Normalize keywords
    
    
    
    console.log("Header Keywords:", headerRowKeywords);

    // Function to check if a row is completely empty
    const isRowEmpty = (row) => row.every(cell => cell === null || cell.toString().trim() === '');

    // Iterate through each row to find the header keywords
    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
        const row = data[rowIndex];
        console.log(`Row ${rowIndex}:`, row);

        // Skip completely empty rows
        if (isRowEmpty(row)) {
            console.log(`Row ${rowIndex} is empty, skipping.`);
            continue;
        }

        let keywordMatches = new Set(); // Use a Set to count distinct keyword occurrences

        for (let cell of row) {
            if (!cell || cell.toString().trim() === '') {
                console.log(`Row ${rowIndex}, Cell ${row.indexOf(cell)} is empty or whitespace.`);
                continue; // Skip empty cells
            }

            const cellValue = cell.toString().toUpperCase().trim(); // Normalize cell value
            console.log(`Row ${rowIndex}, Cell Value: "${cellValue}"`);

            if (headerRowKeywords.some(keyword => cellValue.includes(keyword))) {
                keywordMatches.add(cellValue); // Add to the Set if a keyword is found
                console.log(`Keyword Matched in Row ${rowIndex}: "${cellValue}"`);
            }
        }

        // Check if the row contains at least 3 distinct header keywords
        if (keywordMatches.size >= 3) {
            console.log(`Header Row Identified at Index: ${rowIndex}`);
            return rowIndex; // Return the current row index as the header row index
        }
    }

    console.log("No suitable header row found.");
    return -1; // Return -1 if no suitable header row is found
}




async function fetchHeaderKeywords(url) {
    try {
      const response = await fetch(url); // Fetch the JSON file from the CDN
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json(); // Parse the JSON response
      return data.headerKeywords; // Return the headerKeywords array
    } catch (error) {
      console.error("Could not fetch header keywords:", error);
      return []; // Return an empty array in case of error
    }
  }


app.post('/submitImage', upload.single('fileUploadImage'), async (req, res) => {  
      let fileUrl = ''; // Initialize outside the try block
      console.log(`fileUrl initialized: ${fileUrl}`);
      try {
        console.log('Processing Image submission...');
        if (!req.file) {
            console.log({ success: false, message: "No file uploaded." });
            return res.status(400).json({ success: false, message: "No file uploaded." });
           
        }

        const fileBuffer = req.file.buffer;
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' ,WTF: true});
        

        if (workbook.SheetNames.length > 1) {
            return res.status(400).json({ success: false, message: "Please ensure the Excel file contains only one sheet and re-upload." });
        }
        console.log('workbook.SheetNames.length:', workbook.SheetNames.length);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        //const range = XLSX.utils.decode_range(worksheet['!ref']);
        //console.log("Range:", range.s.r, range.e.r, range.s.c, range.e.c);

    
        const headerKeywords = await fetchHeaderKeywords(process.env.HEADERKEYWORDSURL);
        
        
        const headerRowIndex = findHeaderRowIndex(worksheet, headerKeywords);
        console.log('Header Keywords:', headerKeywords);
        console.log('Header row index:', headerRowIndex);
        if (headerRowIndex === -1) {
            return res.status(400).json({ success: false, message: "Header row not found. Please ensure the Excel file is formatted correctly." });
        }

        //const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: headerRowIndex + 1});//+1 to skip header row
        const data = XLSX.utils.sheet_to_json(worksheet, {header: 1, blankrows : true , defval: "" ,range: headerRowIndex + 1});
        const searchColIndex = columnLetterToIndex(req.body.searchColImage);
        const brandColIndex = columnLetterToIndex(req.body.brandColImage);
        const imageColIndex = columnLetterToIndex(req.body.imageColumnImage);
        const validationErrors = [];

        let rowSpecificData = []; // Prepare to package data specific to each row

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const absoluteRowIndex = i + headerRowIndex + 2; // Adjust for zero-based index and header row
        
        // Define these variables outside of the rowData object to use them in conditional checks
        let searchValue = row[searchColIndex];
        let brandValue = row[brandColIndex];
        const imageValue = row[imageColIndex];

        // Now use searchValue, brandValue, and msrpValue in your if conditions
        if (req.body.preferredImageMethod === 'append' && msrpValue !== undefined) {
            if (searchValue === undefined || brandValue === undefined) {
                validationErrors.push(`Row ${i + 1 + headerRowIndex}: Missing brand or search value where MSRP is intended to be appended.`);
            }
            continue; // Skip appending this row to packagedData if it's not missing MSRP
        }
        if (searchValue === undefined) validationErrors.push(`Row ${i + 1 + headerRowIndex}: Missing search value.`);
        else if (searchValue.length < 5) {
            validationErrors.push(`Row ${i + 1 + headerRowIndex}: Search value length must be at least 5 characters.`);
        }
        if (brandValue === undefined) validationErrors.push(`Row ${i + 1 + headerRowIndex}: Missing brand value.`);
        else if (brandValue.length < 2) {
            validationErrors.push(`Row ${i + 1 + headerRowIndex}: Brand value length must be at least 2 characters.`);
        }
        
//convert search values to string
        searchValue = String(searchValue)
        brandValue = String(brandValue)
//create data object
        const rowData = {
            absoluteRowIndex,
            searchValue,
            brandValue,
            imageValue,
        };

        rowSpecificData.push(rowData);
        console.log('headerKeywords:', headerKeywords);
    }


        if (validationErrors.length > 0) {
            return res.status(400).json({ success: false, message: "Validation failed", errors: validationErrors });
        }
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
        // Attach common data fields to the aggregated row-specific data
        const packagedData = {
            rowData: rowSpecificData,
            preferredImageMethod: req.body.preferredImageMethod,
            filePath: fileUrl,
            sendToEmail: req.body.sendToEmail + "@" + req.body.inputGroupSelect03,
        };
        
        console.log('Packaged data:', packagedData);
        
        try {
            const serviceResponse = await sendPackagedDataToService(packagedData);
            console.log(serviceResponse.message);
            // Send a response back to the client indicating success
            res.json({ success: true, message: "File read and upload successful, Packaged rows for batch processing, Submit successful", fileUrl, serviceMessage: serviceResponse.message });
        } catch (error) {
            console.error("Error during external service processing:", error);
            // Check the type of error and respond accordingly
            if (error.message === 'Failed to process data by the external service.') {
                // Return a specific error message related to the external service failure
                res.status(500).json({ success: false, message: "File processed and uploaded, but failed during external service processing.", error: error.message, fileUrl });
            } else {
                // Handle other unexpected errors
                res.status(500).json({ success: false, message: "An unexpected error occurred.", error: error.toString() });
            }
        }
        
    } catch (error) {
        // Check if the error is from sendPackagedDataToService
        if (error.message === 'Failed to process data by the external service.') {
            console.error("Error during external service processing:", error.message);
            // Return a more specific error message related to the external service failure
            return res.status(500).json({ success: false, message: "File processed and uploaded, but failed during external service processing.", error: error.message, fileUrl });
        } else {
            // Handle other errors that might have occurred during request processing
            console.error("Error during Image submission:", error);
            res.status(500).json({ success: false, message: "An unexpected error occurred.", error: error.toString() });
        }
    }
});

//app.post('/submitImage', upload.single('fileUploadImage'), async (req, res) => {
//    try {
//        console.log('Processing image submission...');
//        console.log('Payload Received:', req.file); // Logs the payload details
//        const fileBuffer = req.file.buffer;
//
//
//
//
//
//
//        // Implement your validation logic here
//        // For example, check if certain sheets exist or certain values are valid
//        const isValid = false; // Placeholder validation result
//
//
//
//
//
//        if (isValid) {
//            const fileName = `${uuidv4()}-${req.file.originalname}`;
//            await uploadFileToSpaces(fileBuffer, fileName); // Upload original file to S3
//
//            console.log('File uploaded to S3 successfully.');
//            res.json({ success: true, message: "File processed and uploaded successfully." });
//        } else {
//            res.status(400).json({ success: false, message: "File validation failed." });
//        }
//    } catch (error) {
//        console.error("Error during file submission:", error);
//        res.status(500).json({ success: false, message: "An unexpected error occurred.", error: error.toString() });
//    }
//});


app.post('/submitMsrp', upload.single('fileUploadMsrp'), async (req, res) => {
    let fileUrl = ''; // Initialize outside the try block
    console.log(`fileUrl initialized: ${fileUrl}`);
    try {
        console.log('Processing MSRP submission...');
        if (!req.file) {
            console.log({ success: false, message: "No file uploaded." });
            return res.status(400).json({ success: false, message: "No file uploaded." });
           
        }

        const fileBuffer = req.file.buffer;
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' ,WTF: true});
        

        if (workbook.SheetNames.length > 1) {
            return res.status(400).json({ success: false, message: "Please ensure the Excel file contains only one sheet and re-upload." });
        }
        console.log('workbook.SheetNames.length:', workbook.SheetNames.length);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        const range = XLSX.utils.decode_range(worksheet['!ref']);
        console.log("Range:", range.s.r, range.e.r, range.s.c, range.e.c);

    
        const headerKeywords = await fetchHeaderKeywords(process.env.HEADERKEYWORDSURL);

        
        const headerRowIndex = findHeaderRowIndex(worksheet, headerKeywords);
        console.log('Header row index:', headerRowIndex);
        if (headerRowIndex === -1) {
            return res.status(400).json({ success: false, message: "Header row not found. Please ensure the Excel file is formatted correctly." });
        }

        //const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: headerRowIndex + 1});//+1 to skip header row
        const data = XLSX.utils.sheet_to_json(worksheet, {header: 1, blankrows : true , defval: "" ,range: headerRowIndex + 1});
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
            validationErrors.push(`Row ${i + 1 + headerRowIndex}: Search value length must be at least 8 characters.`);
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
        res.json({ success: true, message: "File read & submit batch process success", fileUrl, serviceMessage: serviceResponse.message });
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
// Define the URL to which you want to send the packaged data

function sendPackagedDataToService(packagedData) {
    return new Promise((resolve, reject) => {
        // Use fetch API to send data to the external service
        fetch(process.env.MID_API_SERVICE_URL, {
            method: 'POST', // or 'PUT'
            headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json',},
                            body: JSON.stringify(packagedData),
                        })
                        .then(response => {
                            // Check if the response status code is in the 200-299 range
                            if (!response.ok) {
                                throw new Error('Network response was not ok. Status Code: ' + response.status);
                            }
                            return response.json(); // Parse JSON body of the response
                        })
                        // .then(data => {
                        //     // Check for success property in the response data
                        //     if(data.success) {
                        //         resolve({ 
                        //             success: true, 
                        //             message: "Data processed successfully by the external service.", 
                        //             statusCode: 200 // Assuming success corresponds to a 200 OK status
                        //         });
                        //     } else {
                        //         reject({ 
                        //             success: false, 
                        //             message: "Failed to process data by the external service. The service responded with an error.", 
                        //             statusCode: 200 // This assumes that the service uses 200 OK for operational errors
                        //         });
                        //     }
                        // })
                        .then(data => {
                            // Assuming the service sends back a success message as part of the data
                            if(data.message && data.message.includes("Processing started successfully")) {
                                resolve({ 
                                    success: true, 
                                    message: "Data processed successfully by the external service.", 
                                    statusCode: 200 // Assuming this corresponds to a 200 OK status
                                });
                            } else {
                                reject({ 
                                    success: false, 
                                    message: "The service responded, but the data processing did not start successfully.", 
                                    statusCode: 200 // Adjust based on actual service behavior
                                });
                            }
                        })                        
                        .catch((error) => {
                            // Handle network errors and other exceptions
                            reject({ 
                                success: false, 
                                message: "Failed to process data by the external service.", 
                                error: error.toString(),
                                statusCode: error.response ? error.response.status : 'Network or other error' // Handle cases where the error might not have a response due to network failure
                            });
                        });
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
