import * as path from 'path';
import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;
let nsqlStatusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {

    console.log('NSQL extension (client) is now active!');    // Register command to show server status and options
    const showServerInfoCommand = 'nsql.showServerInfo';
    context.subscriptions.push(
        vscode.commands.registerCommand(showServerInfoCommand, () => {
            const items: vscode.QuickPickItem[] = [
                { label: '$(refresh) Restart Server', description: 'Restart the NSQL language server' },
                { label: '$(info) Server Information', description: 'Show information about the NSQL language server' }
            ];

            vscode.window.showQuickPick(items, {
                placeHolder: 'NSQL Language Server Options'
            }).then(selection => {
                if (!selection) return;

                if (selection.label.includes('Restart Server')) {
                    if (client) {
                        updateStatusBar('Restarting...');
                        client.stop().then(() => {
                            client.start().then(() => {
                                updateStatusBar('Ready');
                                vscode.window.showInformationMessage('NSQL Language Server restarted successfully.');
                            });
                        });
                    }
                } else if (selection.label.includes('Server Information')) {
                    vscode.window.showInformationMessage('NSQL Language Server\nVersion: 0.2.0\nStatus: Active', 'OK');
                }
            });
        })
    );

    // --- Status Bar Item Setup ---
    nsqlStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    nsqlStatusBarItem.text = `$(database) NSQL`;
    nsqlStatusBarItem.tooltip = 'NSQL Language Server Status (Click for options)';
    nsqlStatusBarItem.command = showServerInfoCommand; // Command to run on click
    context.subscriptions.push(nsqlStatusBarItem);
    nsqlStatusBarItem.show();
    updateStatusBar('Initializing...');

    // --- Language Server Setup ---

    const serverModule = context.asAbsolutePath(
        path.join('out', 'server.js')
    );

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] } // Debug options for the server
        }
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for nsql documents
        documentSelector: [{ scheme: 'file', language: 'nsql' }],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            // fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc') // Example configuration sync
        },        // Update status bar when server state changes
        diagnosticCollectionName: 'nsql-diagnostics',
        initializationFailedHandler: (error) => {
            updateStatusBar('Error');
            console.error('Client initialization failed:', error);
            vscode.window.showErrorMessage(`Failed to initialize NSQL Language Server: ${error.message}`);
            return false; // Don't retry initialization
        }
    };

    // Create the language client and start the client.
    client = new LanguageClient(
        'nsqlLanguageServer',
        'NSQL Language Server',
        serverOptions,
        clientOptions
    );    // Start the client. This will also launch the server
    console.log('Starting NSQL Language Client...');
    updateStatusBar('Starting...');
    client.start().then(() => {
        console.log('NSQL Language Client started successfully.');
        updateStatusBar('Ready'); // Update status bar on successful start
        vscode.window.showInformationMessage('NSQL Language Server started successfully');
    }).catch(error => {
        console.error('Failed to start NSQL Language Client:', error);
        updateStatusBar('Failed'); // Update status bar on failure
        vscode.window.showErrorMessage('Failed to start the NSQL Language Server.');
    });
}

// Helper function to update the status bar item
function updateStatusBar(status: string, _color?: string): void {
    if (nsqlStatusBarItem) {
        // Choose appropriate icon based on status
        let icon = '$(database)';
        if (status.toLowerCase().includes('ready')) {
            icon = '$(check)';
        } else if (status.toLowerCase().includes('failed')) {
            icon = '$(error)';
        } else if (status.toLowerCase().includes('starting') || status.toLowerCase().includes('initializing')) {
            icon = '$(sync~spin)';
        } else if (status.toLowerCase().includes('stopping') || status.toLowerCase().includes('restarting')) {
            icon = '$(sync~spin)';
        }

        nsqlStatusBarItem.text = `${icon} NSQL: ${status}`;
        nsqlStatusBarItem.tooltip = `NSQL Language Server: ${status} (Click for options)`;
    }
}

// This method is called when your extension is deactivated
export function deactivate(): Thenable<void> | undefined {
    updateStatusBar('Stopping...');
    if (nsqlStatusBarItem) {
        nsqlStatusBarItem.dispose();
    }
    if (!client) {
        return undefined;
    }
    console.log('Deactivating NSQL Language Client...');
    return client.stop().then(() => {
        console.log('NSQL Language Client stopped.');
    });
}