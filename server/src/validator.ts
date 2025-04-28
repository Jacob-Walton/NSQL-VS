import {
    TextDocument,
    Diagnostic,
    DiagnosticSeverity,
    Connection
} from 'vscode-languageserver/node';

export async function validateTextDocument(
    textDocument: TextDocument, 
    connection: Connection,
    hasDiagnosticRelatedInformationCapability: boolean
): Promise<void> {
    const text = textDocument.getText();
    const diagnostics: Diagnostic[] = [];
    
    connection.console.log('Using built-in NSQL validator');
    
    // Split text into lines for analysis
    const lines = text.split('\n');
    
    // Track multiline statements
    let currentStatement: string[] = [];
    let statementStartLine = 0;
    
    // Process each line
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // Skip empty lines and comments
        if (trimmedLine === '' || trimmedLine.startsWith('>>')) {
            // If we have a current statement and hit a comment, don't end the statement
            if (trimmedLine.startsWith('>>')) {
                continue;
            }
            
            // Empty line doesn't necessarily end a statement, continue collecting
            continue;
        }
        
        // Start or continue collecting statement
        if (currentStatement.length === 0) {
            statementStartLine = i;
        }
        currentStatement.push(line);
        
        // Check for statement terminators
        if (trimmedLine.endsWith(';') || /\bPLEASE\b\s*$/.test(trimmedLine)) {
            // Statement is complete, reset the collector
            currentStatement = [];
            continue;
        }
        
        // Check for end of file or if next line starts a new statement
        const isLastLine = i === lines.length - 1;
        const nextLineIsNewStatement = !isLastLine && 
            /^\s*(ASK|TELL|FIND|SHOW|GET)\b/.test(lines[i + 1].trim()) && 
            !currentStatement.some(l => /\b(ASK|TELL|FIND|SHOW|GET)\b/.test(l.trim()));
            
        if (isLastLine || nextLineIsNewStatement) {
            // Reached the end of a statement without proper termination
            if (currentStatement.length > 0 && /\b(ASK|TELL|FIND|SHOW|GET)\b/.test(currentStatement.join(' '))) {
                const lastLine = i;
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: lastLine, character: 0 },
                        end: { line: lastLine, character: lines[lastLine].length }
                    },
                    message: "Statement should end with semicolon (;) or 'PLEASE'",
                    source: 'nsql-server'
                });
            }
            currentStatement = [];
        }
        
        // Per-line validation for some issues
        
        // Check for unclosed quotes (simple version)
        const quoteMatches = line.match(/"/g);
        if (quoteMatches && quoteMatches.length % 2 !== 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i, character: line.length }
                },
                message: "Unclosed string literal",
                source: 'nsql-server'
            });
        }
    }
    
    // Check for common patterns in the entire document
    const fullText = text.toLowerCase();
    
    // Check for FIND statements without filtering conditions
    const findStatements = text.match(/\bFIND\b.*\bFROM\b[^;]*/gi) || [];
    for (const statement of findStatements) {
        if (!/\b(WHERE|THAT|WHICH|IF|WHEN)\b/i.test(statement)) {
            // Find the line number where this statement occurs
            const statementStart = text.indexOf(statement);
            if (statementStart >= 0) {
                const precedingText = text.substring(0, statementStart);
                const lineNumber = (precedingText.match(/\n/g) || []).length;
                
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: {
                        start: { line: lineNumber, character: 0 },
                        end: { line: lineNumber, character: lines[lineNumber].length }
                    },
                    message: "Consider adding a WHERE clause to filter results",
                    source: 'nsql-server'
                });
            }
        }
    }

    // Send the computed diagnostics to VS Code
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    console.log(`Validated ${textDocument.uri}, found ${diagnostics.length} diagnostics.`);
}
