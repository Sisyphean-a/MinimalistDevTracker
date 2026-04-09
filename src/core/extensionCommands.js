function registerExtensionCommands(options) {
  const vscode = options.vscode;
  const context = options.context;
  const reportCommandId = options.reportCommandId;
  const migrateCommandId = options.migrateCommandId;
  const reportPanelController = options.reportPanelController;
  const migrateLegacyStorageData = options.migrateLegacyStorageData;
  const legacyStoragePath = options.legacyStoragePath;
  const storageRootPath = options.storageRootPath;

  const reportCommand = vscode.commands.registerCommand(reportCommandId, async () => {
    await reportPanelController.open();
  });
  const migrationCommand = vscode.commands.registerCommand(migrateCommandId, async () => {
    const summary = await migrateLegacyStorageData({
      sourceDir: legacyStoragePath,
      targetDir: storageRootPath
    });
    const message = `迁移完成：导入 ${summary.importedSessions} 条会话，跳过 ${summary.skippedSessions} 条无效会话，忽略 ${summary.ignoredExistingSessions} 条已存在会话。`;
    await vscode.window.showInformationMessage(message);
  });
  context.subscriptions.push(reportCommand, migrationCommand);
}

module.exports = {
  registerExtensionCommands
};
