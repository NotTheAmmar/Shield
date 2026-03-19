module.exports = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized: Missing X-User-Id header' });
    }

    // Attach user identity to the request object (mimics JWT payload extraction)
    req.user = { id: userId };
    next();
};
