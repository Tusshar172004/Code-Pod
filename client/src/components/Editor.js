import React, { useEffect, useRef } from "react";
import "codemirror/mode/javascript/javascript";
import "codemirror/theme/dracula.css";
import "codemirror/addon/edit/closetag";
import "codemirror/addon/edit/closebrackets";
import "codemirror/lib/codemirror.css";
import CodeMirror from "codemirror";
import { ACTIONS } from "../Actions";

// The 'code' prop is now passed from the parent component.
function Editor({ socketRef, roomId, onCodeChange, code }) {
  const editorRef = useRef(null);

  useEffect(() => {
    // This part initializes the CodeMirror editor once.
    const init = async () => {
      const editor = CodeMirror.fromTextArea(
        document.getElementById("realtimeEditor"),
        {
          mode: { name: "javascript", json: true },
          theme: "dracula",
          autoCloseTags: true,
          autoCloseBrackets: true,
          lineNumbers: true,
        }
      );
      editorRef.current = editor;

      // Set the initial value from the prop.
      editor.setValue(code);

      editor.setSize(null, "100%");
      editorRef.current.on("change", (instance, changes) => {
        const { origin } = changes;
        const newCode = instance.getValue();
        onCodeChange(newCode);

        // Only emit the change if it was a user action, not a programmatic update.
        if (origin !== "setValue") {
          socketRef.current.emit(ACTIONS.CODE_CHANGE, {
            roomId,
            code: newCode,
          });
        }
      });
    };

    init();

    return () => {
      if (editorRef.current) {
        editorRef.current.toTextArea();
      }
    };
  }, [code, onCodeChange, roomId, socketRef]);

  // This new useEffect listens for changes in the 'code' prop
  // and updates the editor's content.
  useEffect(() => {
    if (editorRef.current && code !== editorRef.current.getValue()) {
      editorRef.current.setValue(code);
    }
  }, [code]);

  return (
    <div style={{ height: "600px" }}>
      <textarea id="realtimeEditor"></textarea>
    </div>
  );
}

export default Editor;