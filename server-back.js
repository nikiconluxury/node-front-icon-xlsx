require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid'); // For unique file naming
const path = require('path');

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

// Conversion maps from your requirements
const preferredImageMethodMap = {
    'append': 'A',
    'overwrite': 'O',
    'newColumn': 'MNC',
};

const msrpMethodMap = {
    'append': 'A',
    'overwrite': 'O',
    'newColumn': 'MNC',

};

const additionalInfoMap = {
    'Minimal': 'Regular',
    'AdditionalInfo': 'Additional_Info',
    'Debug': 'Debug'
};

// Route to handle form submission
// Route to handle form submission
app.post('/submit', upload.fields([
    { name: 'fileUploadImage', maxCount: 1 },
    { name: 'fileUploadMsrp', maxCount: 1 }
]), async (req, res) => {
    try {
        let fileUrl = "";

        // Process file uploads and get file URL
        if (req.files['fileUploadImage']) {
            // Process image file upload
            const imageFile = req.files['fileUploadImage'][0];
            const imageFileExtension = path.extname(imageFile.originalname);
            const imageFilename = `${uuidv4()}${imageFileExtension}`;
            const imageCommand = new PutObjectCommand({
                Bucket: process.env.SPACES_BUCKET_NAME,
                Key: imageFilename,
                Body: imageFile.buffer,
                ACL: 'public-read',
            });
            await s3Client.send(imageCommand);
            fileUrl = `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET_NAME}/${imageFilename}`;
        }

        if (req.files['fileUploadMsrp']) {
            // Process MSRP file upload
            const msrpFile = req.files['fileUploadMsrp'][0];
            const msrpFileExtension = path.extname(msrpFile.originalname);
            const msrpFilename = `${uuidv4()}${msrpFileExtension}`;
            const msrpCommand = new PutObjectCommand({
                Bucket: process.env.SPACES_BUCKET_NAME,
                Key: msrpFilename,
                Body: msrpFile.buffer,
                ACL: 'public-read',
            });
            await s3Client.send(msrpCommand);
            fileUrl = `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET_NAME}/${msrpFilename}`;
        }
        // Determine preferred image and MSRP methods based on user input
        const optionSelection = req.files['fileUploadImage'] ? 'Image' : 'MSRP';

        // Set preferredImageMethod based on user input
        let preferredImageMethod = 'N';
        if (optionSelection === 'Image') {
            preferredImageMethod = preferredImageMethodMap[req.body.preferredImageMethod] || 'A'; // Default to 'A' if mapping fails
        }

        // Set preferredMsrpMethod based on user input
        let preferredMsrpMethod = 'N';
        if (optionSelection === 'MSRP') {
            preferredMsrpMethod = msrpMethodMap[req.body.preferredMsrpMethod] || 'A'; // Default to 'A' if mapping fails
        }


        const formData = {
            filepath: fileUrl,
            searchcol: req.body.searchColImage || req.body.searchColMsrp,
            brandcol: req.body.brandColImage || req.body.brandColMsrp,
            destcol: req.body.msrpColumnMsrp || "Q",
            imagecol: req.body.imageColumnImage || "A",
            preferred_image_method: preferredImageMethod,
            msrp_method: preferredMsrpMethod,
            additional_info: additionalInfoMap[req.body.additionalInfo] || 'Regular'
        };

        return res.json({ success: true, message: "Files uploaded and form processed", data: formData });
    } catch (error) {
        console.error(error);
        return res.status(500).send("An error occurred processing your submission.");
    }
});


const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
