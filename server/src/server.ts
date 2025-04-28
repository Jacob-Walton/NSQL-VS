import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    HoverParams,
    Hover
} from 'vscode-languageserver/node';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';

import { validateTextDocument } from './validator';

// Create a connection for the server.
const connection = createConnection(ProposedFeatures.all);

// Create a text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
    console.log('Initializing NSQL Language Server...');
    const capabilities = params.capabilities;

    // Check if the client supports workspace configuration
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    // Check if the client supports workspace folders
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    // Check if the client supports diagnostic related information
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    // Create the result object for the server initialization
    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: true
            },
            hoverProvider: true,
        }
    };

    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true,
            }
        };
    }
    console.log('NSQL Language Server initialized successfully.');
    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(async (event) => {
            connection.console.log(`Workspace folder change event received: ${event}`);
        });
    }

    console.log('NSQL Language Server initialized and ready to process requests.');
});

// Only keep settings for open documents
documents.onDidClose(e => {
    // Clear diagnostics for closed documents
    connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

documents.onDidChangeContent(change => {
    validateTextDocument(change.document, connection, hasDiagnosticRelatedInformationCapability);
});

connection.onDidChangeWatchedFiles(_change => {
    connection.console.log('We received a file change event');
});

// --- Hover Provider ---
connection.onHover(({ textDocument, position }: HoverParams): Hover | null => {
    const document = documents.get(textDocument.uri);
    if (!document) {
        return null;
    }

    // Basic example: Get the word under the cursor
    const line = document.getText({ start: { line: position.line, character: 0 }, end: { line: position.line, character: Infinity } });
    const wordMatch = line.match(/\\b[a-zA-Z_][a-zA-Z0-9_]*\\b/g);
    let hoveredWord: string | null = null;

    if (wordMatch) {
        let startChar = 0;
        for (const word of wordMatch) {
            const endChar = startChar + word.length;
            if (position.character >= startChar && position.character <= endChar) {
                hoveredWord = word;
                break;
            }
            // Find next word start (including non-word chars)
            const nextMatch = line.substring(endChar).match(/\\S/);
            if (!nextMatch || typeof nextMatch.index === 'undefined') break;
            startChar = endChar + nextMatch.index;
        }
    }


    if (hoveredWord) {
        // Provide hover based on the word (e.g., check if it's a keyword)
        const upperWord = hoveredWord.toUpperCase();
        let hoverContent = `Identifier: \`${hoveredWord}\``; // Default

        // Check against known keywords (extracted from lexer.c)
        const keywords = ['ASK', 'TELL', 'FIND', 'SHOW', 'GET', 'FOR', 'FROM', 'WHERE', 'WHEN', 'IF', 'JOIN', 'ON', 'GROUP', 'BY', 'ORDER', 'SORT', 'LIMIT', 'ADD', 'REMOVE', 'UPDATE', 'CREATE', 'RECORD', 'FIELD', 'AS', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'IS', 'NULL', 'TRUE', 'FALSE', 'INTEGER', 'DECIMAL', 'STRING', 'BOOLEAN', 'DATE', 'DATETIME', 'PRIMARY', 'KEY', 'UNIQUE', 'INDEX', 'CONSTRAINT', 'CHECK', 'DEFAULT', 'AUTOINCREMENT']; // Add all keywords
        if (keywords.includes(upperWord)) {
            hoverContent = `**Keyword:** \`${upperWord}\`\\n\\nNSQL language keyword.`;
        }

        return {
            contents: {
                kind: 'markdown',
                value: hoverContent
            }
        };
    }

    return null; // No hover information
});

// --- Completion Provider ---
connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
        const keywords: CompletionItem[] = [
            // Query Types
            { label: 'ASK', kind: CompletionItemKind.Keyword, data: 'query' },
            { label: 'TELL', kind: CompletionItemKind.Keyword, data: 'query' },
            { label: 'FIND', kind: CompletionItemKind.Keyword, data: 'query' },
            { label: 'SHOW', kind: CompletionItemKind.Keyword, data: 'query' },
            { label: 'GET', kind: CompletionItemKind.Keyword, data: 'query' }, // Assuming GET exists

            // Clauses
            { label: 'FOR', kind: CompletionItemKind.Keyword, data: 'clause' },
            { label: 'FROM', kind: CompletionItemKind.Keyword, data: 'clause' },
            { label: 'WHERE', kind: CompletionItemKind.Keyword, data: 'clause' },
            { label: 'WHEN', kind: CompletionItemKind.Keyword, data: 'clause' }, // Synonym for WHERE?
            { label: 'IF', kind: CompletionItemKind.Keyword, data: 'clause' },   // Synonym for WHERE?
            { label: 'JOIN', kind: CompletionItemKind.Keyword, data: 'clause' },
            { label: 'ON', kind: CompletionItemKind.Keyword, data: 'clause' },
            { label: 'GROUP BY', kind: CompletionItemKind.Keyword, data: 'clause' },
            { label: 'ORDER BY', kind: CompletionItemKind.Keyword, data: 'clause' },
            { label: 'SORT BY', kind: CompletionItemKind.Keyword, data: 'clause' }, // Synonym for ORDER BY?
            { label: 'LIMIT', kind: CompletionItemKind.Keyword, data: 'clause' },
            { label: 'AS', kind: CompletionItemKind.Keyword, data: 'clause' },

            // TELL Actions
            { label: 'ADD', kind: CompletionItemKind.Keyword, data: 'action' },
            { label: 'REMOVE', kind: CompletionItemKind.Keyword, data: 'action' },
            { label: 'UPDATE', kind: CompletionItemKind.Keyword, data: 'action' },
            { label: 'CREATE', kind: CompletionItemKind.Keyword, data: 'action' },
            { label: 'RECORD', kind: CompletionItemKind.Keyword, data: 'action' }, // Part of CREATE?
            { label: 'FIELD', kind: CompletionItemKind.Keyword, data: 'action' },  // Part of CREATE/ADD?

            // Operators / Conditions
            { label: 'AND', kind: CompletionItemKind.Operator, data: 'operator' },
            { label: 'OR', kind: CompletionItemKind.Operator, data: 'operator' },
            { label: 'NOT', kind: CompletionItemKind.Operator, data: 'operator' },
            { label: 'IN', kind: CompletionItemKind.Operator, data: 'operator' },
            { label: 'LIKE', kind: CompletionItemKind.Operator, data: 'operator' },
            { label: 'IS NULL', kind: CompletionItemKind.Operator, data: 'operator' },
            { label: 'IS NOT NULL', kind: CompletionItemKind.Operator, data: 'operator' },

            // Literals / Types
            { label: 'TRUE', kind: CompletionItemKind.Value, data: 'literal' },
            { label: 'FALSE', kind: CompletionItemKind.Value, data: 'literal' },
            { label: 'NULL', kind: CompletionItemKind.Value, data: 'literal' },
            { label: 'INTEGER', kind: CompletionItemKind.TypeParameter, data: 'type' },
            { label: 'DECIMAL', kind: CompletionItemKind.TypeParameter, data: 'type' },
            { label: 'STRING', kind: CompletionItemKind.TypeParameter, data: 'type' },
            { label: 'BOOLEAN', kind: CompletionItemKind.TypeParameter, data: 'type' },
            { label: 'DATE', kind: CompletionItemKind.TypeParameter, data: 'type' },
            { label: 'DATETIME', kind: CompletionItemKind.TypeParameter, data: 'type' },

            // Constraints / Definitions (from parser.c mentions)
            { label: 'PRIMARY KEY', kind: CompletionItemKind.Keyword, data: 'constraint' },
            { label: 'UNIQUE', kind: CompletionItemKind.Keyword, data: 'constraint' },
            { label: 'INDEX', kind: CompletionItemKind.Keyword, data: 'definition' },
            { label: 'CONSTRAINT', kind: CompletionItemKind.Keyword, data: 'definition' },
            { label: 'CHECK', kind: CompletionItemKind.Keyword, data: 'constraint' },
            { label: 'DEFAULT', kind: CompletionItemKind.Keyword, data: 'constraint' },
            { label: 'AUTOINCREMENT', kind: CompletionItemKind.Keyword, data: 'constraint' }, // Common SQL term
        ];

        return keywords;
    }
);

// Resolve additional information for the selected completion item.
connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        switch (item.data) {
            case 'query': item.detail = 'NSQL Query Type'; item.documentation = `Starts a ${item.label} query.`; break;
            case 'clause': item.detail = 'NSQL Clause'; item.documentation = `Specifies the ${item.label} part of a query.`; break;
            case 'action': item.detail = 'NSQL TELL Action'; item.documentation = `Performs the ${item.label} action in a TELL query.`; break;
            case 'operator': item.detail = 'NSQL Operator'; item.documentation = `Used in conditions (e.g., WHERE ${item.label} ...).`; break;
            case 'literal': item.detail = 'NSQL Literal Value'; item.documentation = `Represents the value ${item.label}.`; break;
            case 'type': item.detail = 'NSQL Data Type'; item.documentation = `Specifies the data type ${item.label}.`; break;
            case 'constraint': item.detail = 'NSQL Constraint'; item.documentation = `Defines a ${item.label} constraint.`; break;
            case 'definition': item.detail = 'NSQL Definition Keyword'; item.documentation = `Used for defining structures like ${item.label}.`; break;
            default: item.detail = 'NSQL Keyword'; item.documentation = 'A keyword in the NSQL language.';
        }
        return item;
    }
);

documents.listen(connection);

// Listen on the connection
connection.listen();

console.log('NSQL Language Server started and listening.');
