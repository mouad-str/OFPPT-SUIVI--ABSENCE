const pool = require('../config/db');

exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const [notifications] = await pool.query(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [userId]
        );
        res.json({ notifications });
    } catch (err) {
        console.error("GET NOTIFICATIONS ERROR:", err);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        res.json({ message: 'Notification marked as read' });
    } catch (err) {
        console.error("MARK AS READ ERROR:", err);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        await pool.query(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ?',
            [userId]
        );
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        console.error("MARK ALL AS READ ERROR:", err);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Active SSE clients: Map of userId -> array of client response objects
const clients = new Map();

exports.streamNotifications = (req, res) => {
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole !== 'admin' && userRole !== 'formateur') {
        return res.status(403).json({ message: 'Forbidden' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!clients.has(userId)) {
        clients.set(userId, []);
    }
    clients.get(userId).push(res);

    console.log(`[SSE] Client connected: User ${userId} (Role: ${userRole}). Total active users: ${clients.size}`);

    res.write('data: {"type":"ping"}\n\n');

    const heartbeat = setInterval(() => {
        try {
            res.write('data: {"type":"ping"}\n\n');
        } catch (err) {
            // connection might have been closed silently
        }
    }, 30000);

    req.on('close', () => {
        clearInterval(heartbeat);
        
        if (clients.has(userId)) {
            const userClients = clients.get(userId);
            const index = userClients.indexOf(res);
            if (index !== -1) {
                userClients.splice(index, 1);
            }
            if (userClients.length === 0) {
                clients.delete(userId);
            }
        }
        console.log(`[SSE] Client disconnected: User ${userId}. Remaining active users: ${clients.size}`);
    });
};

exports.broadcastNotification = (userId, notification) => {
    if (clients.has(userId)) {
        const userClients = clients.get(userId);
        const data = `data: ${JSON.stringify(notification)}\n\n`;
        userClients.forEach(client => {
            try {
                client.write(data);
            } catch (err) {
                console.error(`[SSE] Error writing to client for user ${userId}:`, err.message);
            }
        });
    }
};

exports.broadcastNotificationToAdmins = async (notification) => {
    try {
        const [admins] = await pool.query('SELECT id FROM admins');
        for (const admin of admins) {
            exports.broadcastNotification(admin.id, notification);
        }
    } catch (err) {
        console.error('[SSE] Error broadcasting to admins:', err.message);
    }
};

exports.createNotification = async (userId, type, category, title, message) => {
    try {
        const [result] = await pool.query(
            'INSERT INTO notifications (user_id, type, category, title, message) VALUES (?, ?, ?, ?, ?)',
            [userId, type, category, title, message]
        );
        
        const notification = {
            id: result.insertId,
            user_id: userId,
            type,
            category,
            title,
            message,
            is_read: 0,
            created_at: new Date()
        };

        exports.broadcastNotification(userId, notification);
        return notification;
    } catch (err) {
        console.error('[NOTIFICATIONS] Error creating and broadcasting notification:', err.message);
    }
};
