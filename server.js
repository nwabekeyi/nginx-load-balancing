
const express = require("express");

const app = express();

// Get the port from the command line
const PORT = process.argv[2] || 3001;

app.get("/", (req, res) => {
  res.json({
    message: "Hello from Express",
    server: `Server running on port ${PORT}`,
    pid: process.pid,
  });
});

app.get("/users", (req, res) => {
  res.json({
    message: "Users endpoint",
    server: `Server running on port ${PORT}`,
    pid: process.pid,
  });
});

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});

