import type { TemplateDescriptor } from '@do-what/protocol';
import styles from './create-run-modal.module.css';

export interface CreateRunModalDraft {
  readonly participantMode: string;
  readonly templateId: string;
  readonly templateInputs: Record<string, unknown>;
}

interface CreateRunModalProps {
  readonly draft: CreateRunModalDraft;
  readonly error: string | null;
  readonly isOpen: boolean;
  readonly isSubmitting: boolean;
  readonly onClose: () => void;
  readonly onDraftChange: (draft: CreateRunModalDraft) => void;
  readonly onSubmit: () => void;
  readonly templates: readonly TemplateDescriptor[];
  readonly workspaceLabel: string;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

export function CreateRunModal(props: CreateRunModalProps) {
  if (!props.isOpen) {
    return null;
  }

  const selectedTemplate =
    props.templates.find((template) => template.templateId === props.draft.templateId) ??
    props.templates[0] ??
    null;

  return (
    <div aria-modal="true" className={styles.backdrop} role="dialog">
      <div className={styles.modal}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Create Run</p>
            <h2 className={styles.title}>Launch a new workflow</h2>
            <p className={styles.subtitle}>Workspace: {props.workspaceLabel}</p>
          </div>
          <button className={styles.closeButton} onClick={props.onClose} type="button">
            Close
          </button>
        </header>

        <label className={styles.field}>
          <span className={styles.label}>Template</span>
          <select
            className={styles.select}
            onChange={(event) =>
              props.onDraftChange({
                ...props.draft,
                templateId: event.target.value,
                templateInputs: {},
              })
            }
            value={props.draft.templateId}
          >
            {props.templates.map((template) => (
              <option key={template.templateId} value={template.templateId}>
                {template.title}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.templateInfo}>
          <h3 className={styles.templateTitle}>
            {selectedTemplate?.title ?? 'No template selected'}
          </h3>
          <p className={styles.templateDescription}>
            {selectedTemplate?.description ?? 'Template descriptors are loading.'}
          </p>
        </div>

        <div className={styles.fields}>
          {selectedTemplate?.inputs.map((input) => {
            const fieldId = `create-run-${input.inputId}`;
            const value = props.draft.templateInputs[input.inputId] ?? input.defaultValue;

            if (input.kind === 'checkbox') {
              return (
                <label className={styles.checkboxRow} htmlFor={fieldId} key={input.inputId}>
                  <input
                    checked={readBoolean(value)}
                    id={fieldId}
                    onChange={(event) =>
                      props.onDraftChange({
                        ...props.draft,
                        templateInputs: {
                          ...props.draft.templateInputs,
                          [input.inputId]: event.target.checked,
                        },
                      })
                    }
                    type="checkbox"
                  />
                  <span>
                    <strong>{input.label}</strong>
                    {input.description ? <small>{input.description}</small> : null}
                  </span>
                </label>
              );
            }

            if (input.kind === 'textarea') {
              return (
                <label className={styles.field} htmlFor={fieldId} key={input.inputId}>
                  <span className={styles.label}>{input.label}</span>
                  <textarea
                    className={styles.textarea}
                    id={fieldId}
                    onChange={(event) =>
                      props.onDraftChange({
                        ...props.draft,
                        templateInputs: {
                          ...props.draft.templateInputs,
                          [input.inputId]: event.target.value,
                        },
                      })
                    }
                    rows={5}
                    value={readString(value)}
                  />
                  {input.description ? (
                    <small className={styles.help}>{input.description}</small>
                  ) : null}
                </label>
              );
            }

            return (
              <label className={styles.field} htmlFor={fieldId} key={input.inputId}>
                <span className={styles.label}>{input.label}</span>
                <input
                  className={styles.input}
                  id={fieldId}
                  onChange={(event) =>
                    props.onDraftChange({
                      ...props.draft,
                      templateInputs: {
                        ...props.draft.templateInputs,
                        [input.inputId]: event.target.value,
                      },
                    })
                  }
                  type="text"
                  value={readString(value)}
                />
                {input.description ? <small className={styles.help}>{input.description}</small> : null}
              </label>
            );
          })}
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Participants</span>
          <select
            className={styles.select}
            onChange={(event) =>
              props.onDraftChange({
                ...props.draft,
                participantMode: event.target.value,
              })
            }
            value={props.draft.participantMode}
          >
            <option value="lead_integrator">Lead + Integrator</option>
            <option value="lead_review_integrator">Lead + Review + Integrator</option>
            <option value="autonomous">Template decides</option>
          </select>
          <small className={styles.help}>
            Participant selection stays local to the modal until Core command dispatch.
          </small>
        </label>

        {props.error ? <p className={styles.error}>{props.error}</p> : null}

        <footer className={styles.footer}>
          <button className={styles.secondaryButton} onClick={props.onClose} type="button">
            Cancel
          </button>
          <button
            className={styles.primaryButton}
            disabled={props.isSubmitting || !selectedTemplate}
            onClick={props.onSubmit}
            type="button"
          >
            {props.isSubmitting ? 'Submitting...' : 'Create Run'}
          </button>
        </footer>
      </div>
    </div>
  );
}
