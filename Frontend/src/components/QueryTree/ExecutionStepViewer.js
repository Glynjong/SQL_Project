import React, { useState } from 'react';
import '../../App.css';

export const ExecutionStepViewer = ({ steps, currentStepId, onStepClick, onStepNext, onStepPrev }) => {
  if (!steps || steps.length === 0) {
    return (
      <div className="execution-viewer">
        <div className="empty-message">No execution steps available</div>
      </div>
    );
  }

  const currentStep = steps.find(s => s.stepId === currentStepId);

  return (
    <div className="execution-viewer">
      <div className="execution-header">
        <h3>Execution Steps</h3>
        <div className="step-counter">
          Step {currentStepId + 1} of {steps.length}
        </div>
      </div>

      <div className="step-list">
        {steps.map((step, index) => (
          <div
            key={step.stepId}
            className={`step-item ${step.stepId === currentStepId ? 'active' : ''}`}
            onClick={() => onStepClick(step.stepId)}
            style={{ marginLeft: `${step.depth * 20}px` }}
          >
            <div className="step-number">{index + 1}</div>
            <div className="step-info">
              <div className="step-type">{step.nodeType}</div>
              {step.relationName && (
                <div className="step-detail">Table: {step.relationName}</div>
              )}
              <div className="step-metrics">
                <span>Rows: {step.actualRows ?? step.estimatedRows}</span>
                <span>Time: {(step.actualTotalTime || 0).toFixed(2)}ms</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {currentStep && (
        <div className="step-details">
          <h4>Step Details</h4>
          <div className="detail-item">
            <label>Node Type:</label>
            <span>{currentStep.nodeType}</span>
          </div>
          {currentStep.relationName && (
            <div className="detail-item">
              <label>Table:</label>
              <span>{currentStep.relationName}</span>
            </div>
          )}
          {currentStep.indexName && (
            <div className="detail-item">
              <label>Index:</label>
              <span>{currentStep.indexName}</span>
            </div>
          )}
          {currentStep.filter && (
            <div className="detail-item">
              <label>Filter:</label>
              <span className="code">{currentStep.filter}</span>
            </div>
          )}
          <div className="detail-item">
            <label>Estimated Rows:</label>
            <span>{currentStep.estimatedRows}</span>
          </div>
          <div className="detail-item">
            <label>Actual Rows:</label>
            <span>{currentStep.actualRows}</span>
          </div>
          <div className="detail-item">
            <label>Loops:</label>
            <span>{currentStep.actualLoops}</span>
          </div>
          <div className="detail-item">
            <label>Execution Time (ms):</label>
            <span>{(currentStep.actualTotalTime || 0).toFixed(3)}</span>
          </div>
          <div className="detail-item">
            <label>Buffers:</label>
            <span>{currentStep.buffers}</span>
          </div>
        </div>
      )}

      <div className="step-controls">
        <button
          onClick={onStepPrev}
          disabled={currentStepId === 0}
          className="btn-step"
        >
          ← Previous
        </button>
        <button
          onClick={onStepNext}
          disabled={currentStepId >= steps.length - 1}
          className="btn-step"
        >
          Next →
        </button>
      </div>
    </div>
  );
};
