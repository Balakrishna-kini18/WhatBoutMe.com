const fs = require('fs');

const cssPath = 'apps/lms/app/components/notes/richNoteEditor.module.css';
let cssContent = fs.readFileSync(cssPath, 'utf8');

const splitIdx = cssContent.indexOf('/* =========================================================================\n   DEDICATED FULL-PAGE EDITOR VIEW (/notes/[noteId])') !== -1
  ? cssContent.indexOf('/* =========================================================================\n   DEDICATED FULL-PAGE EDITOR VIEW (/notes/[noteId])')
  : cssContent.indexOf('/* =========================================================================\r\n   DEDICATED FULL-PAGE EDITOR VIEW (/notes/[noteId])');

if (splitIdx === -1) {
  console.error('Marker not found in richNoteEditor.module.css');
  process.exit(1);
}

const beforeDedicated = cssContent.slice(0, splitIdx);

const newDedicatedCss = `/* =========================================================================
   DEDICATED FULL-PAGE EDITOR VIEW (/notes/[noteId])
   Responsive layout matching WhatBoutMe LMS container grid
   ========================================================================= */
.editorPageWrapper {
  width: 100%;
  max-width: 1360px;
  margin: 0 auto;
  padding: 1rem 1.5rem 3rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.editorPageCard {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  padding: 1.75rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  box-sizing: border-box;
  width: 100%;
}

.sheetHandle {
  display: none;
}

.sectionDivider {
  display: none;
}

.mobileRowBreak {
  display: none;
}

.editorPageTopBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.editorPageBackBtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  font-size: 0.88rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.editorPageBackBtn:hover {
  color: #ea580c;
  background: #fff7ed;
}

.backArrow {
  display: inline-block;
  font-size: 1rem;
}

.editorPageDeleteBtn {
  padding: 0.45rem 0.95rem;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.editorPageDeleteBtn:hover:not(:disabled) {
  background: #fee2e2;
}

.editorPageHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid #f1f5f9;
}

.headerLeftContainer {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  flex: 1;
}

.headerInfoCol {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.editorPageTitleInput {
  font-size: 1.4rem;
  font-weight: 800;
  color: #0f172a;
  border: none;
  border-bottom: 1px solid transparent;
  outline: none;
  width: 100%;
  padding: 0 0 4px;
  transition: border-color 0.15s ease;
}

.editorPageTitleInput:focus {
  border-bottom-color: #f97316;
}

.courseBadgeRow {
  display: none;
}

.courseBadge {
  padding: 2px 10px;
  border-radius: 9999px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #ea580c;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  display: inline-block;
}

.breadcrumbDesktop {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: #64748b;
}

.breadcrumbCourseLink {
  background: none;
  border: none;
  color: #ea580c;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  font-size: inherit;
  font-family: inherit;
}

.breadcrumbSep {
  color: #94a3b8;
  font-size: inherit;
}

.breadcrumbModuleText {
  color: #64748b;
  font-size: inherit;
}

.breadcrumbLessonLink {
  background: none;
  border: none;
  color: #334155;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  font-size: inherit;
  font-family: inherit;
}

.mobileContextRows {
  display: none;
}

.contextItemRow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  color: #334155;
  font-weight: 600;
}

.contextLessonBtn {
  background: none;
  border: none;
  padding: 0;
  color: #334155;
  font-size: 0.82rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.contextModuleText {
  color: #64748b;
  font-size: 0.82rem;
  font-weight: 500;
}

.noteStateRow {
  display: none;
}

.editorPageFooter {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 1.25rem;
  border-top: 1px solid #f1f5f9;
}

/* =========================================================================
   TABLET RESPONSIVE RULES (768px - 1023px)
   ========================================================================= */
@media (min-width: 768px) and (max-width: 1023px) {
  .editorPageWrapper {
    max-width: 900px;
    padding: 1.25rem 1.5rem 3rem;
  }

  .editorPageCard {
    padding: 1.5rem 1.75rem;
    border-radius: 18px;
    gap: 1.25rem;
  }
}

/* =========================================================================
   MOBILE RESPONSIVE RULES (320px - 767px)
   Closely matching reference image UI
   ========================================================================= */
@media (max-width: 767px) {
  .editorPageWrapper {
    width: 100% !important;
    max-width: 100% !important;
    padding: 8px 14px calc(115px + env(safe-area-inset-bottom, 0px)) !important;
    box-sizing: border-box !important;
    gap: 8px !important;
  }

  .editorPageCard {
    background: #ffffff !important;
    border: 1px solid #ece6dd !important;
    border-radius: 24px !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04) !important;
    padding: 12px 16px 16px !important;
    gap: 10px !important;
    box-sizing: border-box !important;
    width: 100% !important;
  }

  /* Sheet top drag handle */
  .sheetHandle {
    display: block !important;
    width: 38px !important;
    height: 4px !important;
    border-radius: 2px !important;
    background: #cbd5e1 !important;
    margin: 0 auto 10px !important;
  }

  .editorPageTopBar {
    display: flex !important;
    justify-content: flex-start !important;
    align-items: center !important;
    width: 100% !important;
    margin-bottom: 2px !important;
  }

  .editorPageBackBtn {
    background: transparent !important;
    border: none !important;
    padding: 2px 0 !important;
    font-size: 0.88rem !important;
    font-weight: 600 !important;
    color: #1e293b !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    box-shadow: none !important;
    cursor: pointer !important;
  }

  .editorPageBackBtn:hover {
    color: #ea580c !important;
    background: transparent !important;
  }

  /* Hide delete button on mobile to match reference image */
  .editorPageDeleteBtn {
    display: none !important;
  }

  .editorPageHeader {
    display: flex !important;
    align-items: flex-start !important;
    justify-content: space-between !important;
    gap: 10px !important;
    padding-bottom: 2px !important;
    border-bottom: none !important;
  }

  .headerLeftContainer {
    display: flex !important;
    align-items: flex-start !important;
    gap: 12px !important;
    flex: 1 !important;
    min-width: 0 !important;
  }

  .docIconBadge {
    width: 44px !important;
    height: 44px !important;
    border-radius: 12px !important;
    background: #fff7ed !important;
    border: 1px solid #fed7aa !important;
    color: #ea580c !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex-shrink: 0 !important;
    margin-top: 1px !important;
  }

  .headerInfoCol {
    flex: 1 !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 3px !important;
    min-width: 0 !important;
  }

  .editorPageTitleInput {
    font-size: 1.35rem !important;
    font-weight: 800 !important;
    color: #1e293b !important;
    width: 100% !important;
    border: none !important;
    border-bottom: none !important;
    outline: none !important;
    padding: 0 !important;
    line-height: 1.25 !important;
    background: transparent !important;
  }

  .courseBadgeRow {
    display: flex !important;
    margin: 2px 0 4px !important;
  }

  .courseBadge {
    padding: 2px 10px !important;
    border-radius: 9999px !important;
    background: #fff7ed !important;
    border: 1px solid #fed7aa !important;
    color: #9a3412 !important;
    font-size: 0.72rem !important;
    font-weight: 800 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.02em !important;
    display: inline-block !important;
    width: fit-content !important;
  }

  .breadcrumbDesktop {
    display: none !important;
  }

  .mobileContextRows {
    display: flex !important;
    flex-direction: column !important;
    gap: 4px !important;
    margin-top: 4px !important;
  }

  .contextItemRow {
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    line-height: 1.35 !important;
  }

  .contextItemRow svg {
    flex-shrink: 0 !important;
    color: #94a3b8 !important;
  }

  .contextModuleText {
    font-size: 0.82rem !important;
    color: #64748b !important;
    font-weight: 500 !important;
  }

  .contextLessonBtn {
    background: none !important;
    border: none !important;
    padding: 0 !important;
    color: #0f172a !important;
    font-size: 0.86rem !important;
    font-weight: 800 !important;
    text-align: left !important;
    cursor: pointer !important;
    line-height: 1.35 !important;
  }

  .noteStateRow {
    display: block !important;
    font-size: 0.8rem !important;
    color: #94a3b8 !important;
    font-weight: 500 !important;
    margin-left: 18px !important;
    margin-top: 1px !important;
  }

  .starBtn {
    width: 36px !important;
    height: 36px !important;
    border-radius: 10px !important;
    border: 1px solid #e2e8f0 !important;
    background: #ffffff !important;
    flex-shrink: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    margin-top: 2px !important;
  }

  .sectionDivider {
    display: block !important;
    width: 100% !important;
    height: 1px !important;
    background: #f1f5f9 !important;
    margin: 8px 0 10px !important;
  }

  /* Formatting Toolbar */
  .toolbarBox {
    border: 1px solid #e2e8f0 !important;
    border-radius: 14px !important;
    overflow: hidden !important;
    background: #ffffff !important;
  }

  .toolbar {
    background: #f8fafc !important;
    border-bottom: 1px solid #e2e8f0 !important;
    padding: 8px 10px !important;
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: 4px 6px !important;
    user-select: none !important;
  }

  .mobileRowBreak {
    display: block !important;
    width: 100% !important;
    height: 0 !important;
    margin: 0 !important;
    border: none !important;
  }

  .toolBtn {
    padding: 3px 6px !important;
    border-radius: 6px !important;
    font-size: 0.8rem !important;
    color: #334155 !important;
    gap: 4px !important;
  }

  .toolSelect {
    font-size: 0.8rem !important;
    font-weight: 600 !important;
    color: #0f172a !important;
    background: transparent !important;
    border: none !important;
    padding: 2px 4px !important;
    cursor: pointer !important;
  }

  .toolDivider {
    width: 1px !important;
    height: 16px !important;
    background: #cbd5e1 !important;
    margin: 0 4px !important;
    display: inline-block !important;
    flex-shrink: 0 !important;
  }

  .highlightBtn {
    background: #ffedd5 !important;
    border: 1px solid #fed7aa !important;
    color: #9a3412 !important;
    border-radius: 6px !important;
    font-weight: 600 !important;
  }

  .editorCanvas {
    padding: 12px 14px !important;
    min-height: 120px !important;
    font-size: 0.92rem !important;
    line-height: 1.55 !important;
    color: #1e293b !important;
    background: #ffffff !important;
  }

  .tagsSection {
    display: flex !important;
    flex-direction: column !important;
    gap: 6px !important;
    margin-top: 2px !important;
  }

  .tagsLabel {
    font-size: 0.82rem !important;
    font-weight: 700 !important;
    color: #0f172a !important;
  }

  .tagsWrap {
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: 6px !important;
  }

  .tagPill {
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 3px 10px !important;
    border-radius: 9999px !important;
    background: #ffedd5 !important;
    color: #9a3412 !important;
    border: 1px solid #fed7aa !important;
    font-size: 0.76rem !important;
    font-weight: 600 !important;
  }

  .tagRemoveBtn {
    background: none !important;
    border: none !important;
    color: #ea580c !important;
    cursor: pointer !important;
    font-size: 0.95rem !important;
    line-height: 1 !important;
    padding: 0 !important;
  }

  .tagInput {
    border: 1px dashed #cbd5e1 !important;
    border-radius: 9999px !important;
    padding: 4px 12px !important;
    font-size: 0.76rem !important;
    outline: none !important;
    width: 110px !important;
    color: #475569 !important;
    background: #ffffff !important;
  }

  .editorPageFooter {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    width: 100% !important;
    padding-top: 6px !important;
    border-top: none !important;
    margin-top: 2px !important;
  }

  .cancelBtn {
    flex: 1 !important;
    height: 46px !important;
    border-radius: 14px !important;
    border: 1px solid #e2e8f0 !important;
    background: #ffffff !important;
    color: #0f172a !important;
    font-size: 0.92rem !important;
    font-weight: 700 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    transition: all 0.15s ease !important;
  }

  .cancelBtn:hover {
    background: #f8fafc !important;
    border-color: #cbd5e1 !important;
  }

  .saveBtn {
    flex: 1 !important;
    height: 46px !important;
    border-radius: 14px !important;
    background: #ea580c !important;
    border: none !important;
    color: #ffffff !important;
    font-size: 0.92rem !important;
    font-weight: 700 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    box-shadow: 0 2px 8px rgba(234, 88, 12, 0.28) !important;
    transition: all 0.15s ease !important;
  }

  .saveBtn:hover:not(:disabled) {
    background: #c2410c !important;
  }
}
`;

fs.writeFileSync(cssPath, beforeDedicated + newDedicatedCss, 'utf8');
console.log('Successfully updated richNoteEditor.module.css with reference matching styling');
