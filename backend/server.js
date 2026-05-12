require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));  

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Import routes
const inventoryRoutes = require('./routes/inventory');
const donorRoutes = require('./routes/donors');
const whatsappRoutes = require('./routes/whatsapp');
const hospitalRoutes = require('./routes/hospitals');

app.use('/api/inventory', inventoryRoutes);
app.use('/api/donors', donorRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/hospitals', hospitalRoutes);

// Simple health check
app.get('/', (req, res) => {
  res.json({ message: 'Smart Blood Bank API is running' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});