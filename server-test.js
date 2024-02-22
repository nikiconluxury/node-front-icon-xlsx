require('dotenv').config(); // Ensure this is at the top to load environment variables from a .env file
const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { defaultProvider } = require('@aws-sdk/credential-provider-node');

// Express app setup
const app = express();
const upload = multer({ storage: multer.memoryStorage() }); // Configured for memory storage

// AWS S3 Client setup for DigitalOcean Spaces
const s3Client = new S3Client({
  endpoint: process.env.SPACES_ENDPOINT, // Ensure this is set in your .env file, e.g., 'https://nyc3.digitaloceanspaces.com'
  region: 'us-east-1', // Keep as 'us-east-1' for compatibility
  credentials: defaultProvider(), // Utilizes credentials from .aws/credentials or environment variables
});

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Handle file upload
app.post('/upload', upload.single('upload'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('Please upload a file.');
  }

  const file = req.file;
  const bucketName = process.env.SPACES_BUCKET_NAME; // Set your bucket name in .env file

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: file.originalname,
      Body: file.buffer,
      ACL: 'public-read', // Optional: Adjust according to your privacy requirements
    });

    await s3Client.send(command);
    console.log(`${file.originalname} uploaded successfully to ${bucketName}.`);
    return res.redirect('/success');
  } catch (error) {
    console.error('S3 Upload Error:', error);
    return res.redirect('/error');
  }
});

// Route handlers for success and error pages
app.get('/success', (req, res) => {
  res.sendFile(__dirname + '/public/success.html');
});

app.get('/error', (req, res) => {
  res.sendFile(__dirname + '/public/error.html');
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
