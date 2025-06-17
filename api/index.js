import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { createServer } from 'http';

// Express app setup
const app = express();
app.use(cors());
app.use(express.json());

// Helper to generate proxy
function generateProxyUrl(directUrl) {
  return `https://purple-glitter-924b.miguelalocal.workers.dev/?url=${encodeURIComponent(directUrl)}`;
}

// Main API route
app.get('/api/terabox', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ status: 'error', message: 'URL parameter is required' });
    }

    const fileInfoUrl = `https://terabox-api-nt.vercel.app/generate_file?url=${encodeURIComponent(url)}`;
    const fileInfoResponse = await fetch(fileInfoUrl);
    if (!fileInfoResponse.ok) throw new Error(`File info API failed`);

    const fileData = await fileInfoResponse.json();
    const filesWithLinks = await Promise.all(
      fileData.list.map(async (file) => {
        try {
          const downloadUrl = `https://terabox-api-nt.vercel.app/generate_link?fs_id=${file.fs_id}&uk=${fileData.uk}&shareid=${fileData.shareid}&timestamp=${Math.floor(Date.now() / 1000)}&sign=${fileData.sign}`;
          const downloadResponse = await fetch(downloadUrl);

          if (downloadResponse.ok) {
            const downloadData = await downloadResponse.json();
            const directLink = downloadData.download_link?.url_1 || downloadUrl;
            const proxyLink = downloadData.download_link?.url_2 || generateProxyUrl(directLink);
            return { ...file, download_links: { url_1: directLink, url_2: proxyLink } };
          } else {
            return { ...file, download_links: null, error: 'Failed to generate download links' };
          }
        } catch (err) {
          return { ...file, download_links: null, error: err.message };
        }
      })
    );

    res.json({
      list: filesWithLinks,
      shareid: fileData.shareid,
      sign: fileData.sign,
      uk: fileData.uk,
      timestamp: fileData.timestamp,
      processed_at: new Date().toISOString(),
      total_files: filesWithLinks.length,
      files_with_links: filesWithLinks.filter(f => f.download_links).length,
      status: 'success'
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message, timestamp: new Date().toISOString() });
  }
});

// Other routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Terabox API', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Terabox API',
    version: '1.0.0',
    endpoints: {
      '/api/terabox?url={url}': 'Get file info and download links',
      '/health': 'Health check'
    }
  });
});

// Export as Vercel handler
const server = createServer(app);
export default (req, res) => server.emit('request', req, res);
