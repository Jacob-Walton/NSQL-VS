import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
    TextDocument,
    Diagnostic,
    DiagnosticSeverity,
    Connection
} from 'vscode-languageserver/node';

const execFileAsync = promisify(execFile);

let nsqlParserPath: string;
let hasDiagnosticRelatedInformationCapability: boolean;
let connection: Connection;

// Initialize with values from the server
export function initialize(parser: string, hasDiagnostics: boolean, conn: Connection) {
    nsqlParserPath = parser;
    hasDiagnosticRelatedInformationCapability = hasDiagnostics;
    connection = conn;
}

export async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    const text = textDocument.getText();
    const diagnostics: Diagnostic[] = [];

    if (!nsqlParserPath || !fs.existsSync(nsqlParserPath)) {
        connection.console.log('Using built-in error detection (parser not available).');
        
        // Look for common syntax problems
        const lines = text.split('\n');
        lines.forEach((line: string, i: number) => {
            // Ignore comments
            if (line.trim().startsWith('>>')) return;
            
            // Check if query statements end with semicolons or PLEASE
            if (!/;|\bPLEASE\b\s*$/.test(line) && 
                /\b(ASK|TELL|FIND|SHOW|GET)\b/.test(line) && 
                !/^\s*$/.test(line)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: i, character: 0 },
                        end: { line: i, character: line.length } 
                    },
                    message: "Statement should end with semicolon (;) or 'PLEASE'",
                    source: 'nsql-server'
                });
            }

            // Check for unclosed quotes
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

            // Check for missing WHERE in conditional clauses
            if (/\bFIND\b.*\bFROM\b/.test(line) && 
                !/\bWHERE\b|\bTHAT\b|\bWHICH\b|\bIF\b|\bWHEN\b/.test(line)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Information,
                    range: {
                        start: { line: i, character: 0 },
                        end: { line: i, character: line.length }
                    },
                    message: "Consider adding a WHERE clause to filter results",
                    source: 'nsql-server'
                });
            }
        });
    } else {
        try {
            // Create a temporary file for the NSQL code
            const tempFile = path.join(os.tmpdir(), `nsql_temp_${Date.now()}.nsql`);
            fs.writeFileSync(tempFile, text);

            // Run the parser on the temp file
            const { stdout } = await execFileAsync(nsqlParserPath, [tempFile]);
            
            try {
                // Parse the JSON output from the parser
                const parserErrors = JSON.parse(stdout);
                
                // Convert parser errors to LSP diagnostics
                for (const error of parserErrors) {
                    const line = error.line > 0 ? error.line - 1 : 0;
                    const column = error.column > 0 ? error.column - 1 : 0;
                    const length = error.length || 1;
                    
                    const diagnostic: Diagnostic = {
                        severity: error.severity === "warning" ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
                        range: {
                            start: { line, character: column },
                            end: { line, character: column + length }
                        },
                        message: error.message,
                        source: 'nsql-parser'
                    };
                    
                    diagnostics.push(diagnostic);
                }
            } catch (jsonError: any) {
                connection.console.log(`Error parsing output from NSQL parser: ${jsonError.message}`);
                connection.console.log(`Parser output: ${stdout}`);
            }

            // Clean up the temp file
            fs.unlinkSync(tempFile);
        } catch (error: any) {
            // If parsing fails, add a diagnostic about parser failure
            console.error('Error running NSQL parser:', error);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 10 }
                },
                message: `NSQL parser failed: ${error.message || 'Unknown error'}`,
                source: 'nsql-server'
            });
        }
    }

    // Send the computed diagnostics to VS Code.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    console.log(`Validated ${textDocument.uri}, found ${diagnostics.length} diagnostics.`);
}
