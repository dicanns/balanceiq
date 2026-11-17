// The bill inbox (forward an email with an invoice) is built, but the mail address
// it needs is not set up: it must live on a domain of its own, because turning on
// mail routing for balanceiq.ca would disturb that domain's normal mail.
// While this is false the app shows nothing about the inbox, fetches nothing and
// offers no inbox tool to an assistant. Set it to true once the address works.
export const BILL_INBOX_LIVE = false;
