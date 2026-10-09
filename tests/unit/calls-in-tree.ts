import ts from 'typescript';

/**
 * The calls in a file's parse tree, counted apart from the collection-calls
 * detector's walk (#371). Its fixture tests (tests/unit) and its run over
 * every test file (tests/guards, #515) both cross-check with it.
 */
export const callsInTree = (source: string, fileName: string): number => {
  let calls = 0;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) ||
      ts.isNewExpression(node) ||
      ts.isTaggedTemplateExpression(node)
    )
      calls += 1;
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true));
  return calls;
};
