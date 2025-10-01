// api/send-email.js
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only grab HTML from the body
  const { html } = req.body;

  try {
    const emailRes = await resend.emails.send({
      from: 'reports@redlinecre.com',   // can be anything, but must be a verified domain if you want better deliverability
      to: 'jared@redlinecre.com',       // 👈 always your email
      subject: '📊 New Report Saved',
      html: `
        <h2>New Report Saved</h2>
        <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
        <hr />
        ${html}
      `,
    });

    return res.status(200).json({ success: true, data: emailRes });
  } catch (error) {
    console.error('❌ Email send error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
