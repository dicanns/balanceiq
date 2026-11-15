// Every tool the connector offers, in the order an AI app lists them.
import { booksTools } from './books.mjs';
import { invoicingTools } from './invoicing.mjs';
import { customerTools } from './customers.mjs';
import { payablesTools } from './payables.mjs';
import { bankTools } from './bank.mjs';
import { ledgerTools } from './ledger.mjs';
import { dailyTools } from './daily.mjs';
import { kitchenTools } from './kitchen.mjs';
import { jobTools } from './jobs.mjs';
import { actionTools } from './actions.mjs';

// Reading the books.
export const READ_TOOLS = [
  ...booksTools, ...invoicingTools, ...customerTools, ...payablesTools,
  ...bankTools, ...ledgerTools, ...dailyTools, ...kitchenTools, ...jobTools,
];
// Preparing an entry for the owner to review and save (offered only when the owner allows it).
export const ACTION_TOOLS = actionTools;

export const ALL_TOOLS = [...READ_TOOLS, ...ACTION_TOOLS];
