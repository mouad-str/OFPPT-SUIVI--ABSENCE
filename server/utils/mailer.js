const nodemailer = require('nodemailer');

let transporterPromise = (async () => {
    // If SMTP credentials are provided in env, use them
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }

    // Otherwise, dynamically generate a test Ethereal account
    console.log('⏳ Generating Ethereal SMTP test account...');
    const testAccount = await nodemailer.createTestAccount();
    console.log(`✅ Ethereal Test Account generated: User=${testAccount.user}`);
    return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
            user: testAccount.user,
            pass: testAccount.pass
        }
    });
})();

const sendEmail = async ({ to, subject, html }) => {
    try {
        const transporter = await transporterPromise;
        const fromEmail = process.env.SMTP_FROM || (transporter.options.auth ? transporter.options.auth.user : 'noreply@ofppt-edu.ma');
        
        const mailOptions = {
            from: `"OFPPT Smart Attendance" <${fromEmail}>`,
            to,
            subject,
            html
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Email successfully sent to ${to}: ${info.messageId}`);
        if (transporter.options.host.includes('ethereal')) {
            console.log(`🔗 Ethereal Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
        }
        return info;
    } catch (err) {
        console.error(`❌ Mailer Error sending to ${to}:`, err);
    }
};

module.exports = sendEmail;
