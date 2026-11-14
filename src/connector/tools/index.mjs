// Every tool the connector offers, in the order an AI app lists them.
import { booksTools } from './books.mjs';
import { invoicingTools } from './invoicing.mjs';

export const ALL_TOOLS = [...booksTools, ...invoicingTools];
