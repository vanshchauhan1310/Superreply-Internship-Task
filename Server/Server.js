// server.js
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import gTTS from 'gtts';
import fs from 'fs/promises';

dotenv.config();

const app = express();
const port = 3001;
const BUCKET_NAME = 'voiceFiles';

// Configure multer for file upload handling
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

app.use(cors());
app.use(express.json());

// Initialize Supabase clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Generate signed URL
async function getSignedUrl(filePath) {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(filePath, 3600); // URL valid for 1 hour
  
  if (error) {
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
  return data.signedUrl;
}

// Helper function to check if file exists in bucket
async function checkFileExists(fileName) {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list('output/', {
      search: fileName
    });

  if (error) {
    throw new Error(`Failed to check file existence: ${error.message}`);
  }
  return data && data.length > 0;
}

// Generate unique filename
function generateUniqueFilename(originalname) {
  const timestamp = Date.now();
  const extension = path.extname(originalname);
  return `${timestamp}${extension}`;
}

// Modified /api/synthesize endpoint in server.js
app.post('/api/synthesize', upload.single('voiceFile'), async (req, res) => {
  try {
    const { text } = req.body;
    const voiceFile = req.file;

    if (!text || !voiceFile) {
      return res.status(400).json({ 
        error: 'Both text and voice file are required.' 
      });
    }

    // Generate unique filenames
    const inputFilename = generateUniqueFilename(voiceFile.originalname);
    const outputFilename = `output_${inputFilename}`;
    const inputPath = `input/${inputFilename}`;
    const outputPath = `output/${outputFilename}`;

    // Upload input file to Supabase
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(inputPath, voiceFile.buffer);

    if (uploadError) {
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    // Create temporary file for gTTS
    const tempOutputPath = path.join('/tmp', outputFilename);
    const gtts = new gTTS(text, 'en');
    
    // Generate speech
    await new Promise((resolve, reject) => {
      gtts.save(tempOutputPath, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // Read generated file
    const outputBuffer = await fs.readFile(tempOutputPath);

    // Upload synthesized audio to Supabase
    const { error: synthError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(outputPath, outputBuffer);

    if (synthError) {
      throw new Error(`Failed to upload synthesized audio: ${synthError.message}`);
    }

    // Clean up temporary file
    await fs.unlink(tempOutputPath);

    // Generate signed URL for the synthesized audio
    const signedUrl = await getSignedUrl(outputPath);

    res.json({
      message: 'Audio synthesized successfully',
      url: signedUrl,
      fileName: outputPath  // Add fileName to response
    });

  } catch (error) {
    console.error('Synthesis error:', error);
    res.status(500).json({ 
      error: 'Failed to process audio synthesis',
      details: error.message 
    });
  }
});

// Update the status check endpoint
app.get('/api/check-file/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const exists = await checkFileExists(filename);
    
    if (!exists) {
      return res.json({
        exists: false
      });
    }

    const signedUrl = await getSignedUrl(`output/${filename}`);
    res.json({
      exists: true,
      url: signedUrl
    });

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      error: 'Failed to check synthesis status',
      details: error.message
    });
  }
});


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal server error',
    details: err.message
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

export default app;