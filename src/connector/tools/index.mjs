// Every tool the connector offers, in the order an AI app lists them.
import { booksTools } from './books.mjs';
import { invoicingTools } from './invoicing.mjs';
import { customerTools } from './customers.mjs';
import { payablesTools } from './payables.mjs';
import { bankTools } from './bank.mjs';
import { ledgerTools } from './ledger.mjs';
import { dailyTools } from './daily.mjs';
import { kitchenTools } from './kitchen.mjs';

export const ALL_TOOLS = [
  ...booksTools, ...invoicingTools, ...customerTools, ...payablesTools,
  ...bankTools, ...ledgerTools, ...dailyTools, ...kitchenTools,
];
