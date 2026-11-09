

const express = require("express");

const app = express();

app.use(express.json());

const metrics = [];

app.get("/", (req, res) => {
    res.send("Linux Fleet Manager Backend is running");
});

app.post("/metrics", (req, res) => {
    const record = {
        ...req.body,
        timestamp: new Date().toISOString()
    };

    metrics.push(record);

    console.log("Metrics received:", record);

    res.status(201).json({
        message: "Metrics received successfully"
    });
});

app.get("/metrics", (req, res) => {
    res.json(metrics.slice(-50).reverse());
});

module.exports = app;
