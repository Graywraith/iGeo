export type ExtractedEmailBody = {
    text: string;
    html: string;
};

function coerceString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

// Resend's receiving payload shape can vary by API version; be liberal in what we accept.
export function extractEmailBody(receivedEmail: any): ExtractedEmailBody {
    if (!receivedEmail) return { text: '', html: '' };

    // Common candidates we've seen across providers / versions.
    const textCandidates = [
        receivedEmail.text,
        receivedEmail.textBody,
        receivedEmail.plain,
        receivedEmail.plainBody,
        receivedEmail.body_text,
        receivedEmail.bodyText,
        receivedEmail.content?.text,
        receivedEmail.content?.plain
    ];

    const htmlCandidates = [
        receivedEmail.html,
        receivedEmail.htmlBody,
        receivedEmail.body_html,
        receivedEmail.bodyHtml,
        receivedEmail.content?.html
    ];

    const text = textCandidates.map(coerceString).find((s) => s.length > 0) ?? '';
    const html = htmlCandidates.map(coerceString).find((s) => s.length > 0) ?? '';

    return { text, html };
}

function stripHtmlTags(input: string): string {
    return input
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function makeEmailPreview(receivedEmail: any, maxLength = 180): string {
    const { text, html } = extractEmailBody(receivedEmail);
    const base = text || stripHtmlTags(html);
    if (!base) return '';
    if (base.length <= maxLength) return base;
    return base.slice(0, maxLength - 1).trimEnd() + '…';
}
