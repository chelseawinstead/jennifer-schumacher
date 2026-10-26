/**
 * Vision Board Crew — email sender
 *
 * Sends the registration emails from Jennifer's own Gmail account.
 * It can only SEND email. It cannot read, search or delete anything in her inbox.
 * It only acts on requests that carry the secret key below.
 */

var SECRET_KEY = 'PASTE-SECRET-KEY-HERE'; // the real key is only in Jennifer's setup guide, never in this public repo
var FROM_NAME = 'Jennifer Schumacher';
var REPLY_TO = 'jennifer@schumacherliving.com';

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.token !== SECRET_KEY) return reply_({ ok: false, error: 'wrong key' });
    if (!d.to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.to)) return reply_({ ok: false, error: 'bad email address' });
    if (MailApp.getRemainingDailyQuota() < 1) return reply_({ ok: false, error: 'daily Gmail sending limit reached' });

    MailApp.sendEmail({
      to: d.to,
      subject: String(d.subject || 'Vision Board Crew 2027'),
      body: String(d.text || ''),
      htmlBody: String(d.html || ''),
      name: FROM_NAME,
      replyTo: REPLY_TO
    });
    return reply_({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return reply_({ ok: false, error: String(err) });
  }
}

// Lets the registration system check the connection without sending anything.
function doGet() {
  return reply_({ ok: true, service: 'vision-board-mailer', remaining: MailApp.getRemainingDailyQuota() });
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
