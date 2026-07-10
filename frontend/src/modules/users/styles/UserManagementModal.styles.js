import styled from '@emotion/styled';

// This whole modal previously used fully hardcoded hex colors (#2E2823,
// #dc2626, #d0d5dd, #999, #222, ...) instead of theme.js — the only file
// in the app styled that way, out of sync with the rest of the palette.
// Mapped to theme.js's nearest semantic color below: #2E2823-ish dark
// text/accents → onyx, #dc2626 → danger, #16a34a → success,
// #d0d5dd/#eee/#f0f0f0 → border, #999/#aaa → ashLight, #555/#666/#888 →
// ash, #fafafa/#f5f5f5 → greige.

export const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
`;

export const Modal = styled.div`
  width: 900px;
  max-width: 96vw;
  max-height: 92vh;
  background: ${p => p.theme.colors.white};
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

export const ModalHeader = styled.div`
  padding: 18px 24px 0;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
`;

export const HeaderTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 0;
  flex: 1;
`;

export const HeaderTitle = styled.span`
  font-size: 17px;
  font-weight: 700;
  color: ${p => p.theme.colors.onyx};
`;

export const CloseBtn = styled.button`
  background: none;
  border: none;
  font-size: 22px;
  color: ${p => p.theme.colors.ashLight};
  cursor: pointer;
  line-height: 1;
  padding: 0 0 4px 0;
`;

export const TabRow = styled.div`
  display: flex;
  gap: 0;
  padding: 0 24px;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  flex-shrink: 0;
`;

export const TabBtn = styled.button`
  padding: 10px 20px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: ${p => (p.active ? 700 : 400)};
  color: ${p => (p.active ? p.theme.colors.onyx : p.theme.colors.ash)};
  border-bottom: 2px solid ${p => (p.active ? p.theme.colors.onyx : 'transparent')};
  margin-bottom: -1px;
  transition: color 0.15s;
`;

// The manage tab has its own two independently-scrolling columns (user
// list / edit form). Letting this container also scroll meant it was the
// nearest scrollable ancestor that actually took effect, so both columns
// scrolled together as one instead of independently. The register tab is
// a single simple column, so it keeps its own scroll here as before.
export const ModalBody = styled.div`
  flex: 1;
  min-height: 0;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  overflow-y: ${p => (p.noScroll ? 'hidden' : 'auto')};
`;

export const Field = styled.div` margin-bottom: 14px; `;

export const FieldLabel = styled.label`
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: ${p => p.theme.colors.ash};
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

export const RequiredMark = styled.span` color: ${p => p.theme.colors.onyx}; margin-left: 2px; `;

export const FieldHint = styled.p` font-size: 11px; color: ${p => p.theme.colors.ashLight}; margin-top: 3px; `;

export const Input = styled.input`
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 6px;
  box-sizing: border-box;
  background: ${p => p.theme.colors.white};
  color: ${p => p.theme.colors.onyx};
  outline: none;
  font-family: inherit;
`;

export const Select = Input.withComponent('select');

export const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${p => p.theme.colors.ash};
  cursor: pointer;
`;

export const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 20px;
`;

export const BooleansRow = styled.div`
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  margin-top: 4px;
`;

export const InfoNote = styled.p`
  font-size: 12px;
  color: ${p => p.theme.colors.ash};
  margin-bottom: 14px;
  background: ${p => p.theme.colors.greige};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 6px;
  padding: 8px 12px;
`;

export const ErrorText = styled.div` color: ${p => p.theme.colors.danger}; font-size: 13px; margin-bottom: 12px; `;
export const SuccessText = styled.div` color: ${p => p.theme.colors.success}; font-size: 13px; margin-bottom: 12px; `;

export const FormActionsRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
`;

export const SecondaryBtn = styled.button`
  padding: 9px 22px;
  background: ${p => p.theme.colors.white};
  color: ${p => p.theme.colors.onyx};
  border: 2px solid ${p => p.theme.colors.onyx};
  border-radius: 6px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
`;

export const PrimaryBtn = styled.button`
  padding: 9px 22px;
  background: ${p => (p.muted ? p.theme.colors.ashLight : p.theme.colors.onyx)};
  color: ${p => p.theme.colors.white};
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 14px;
  cursor: ${p => (p.muted ? 'not-allowed' : 'pointer')};
`;

export const PickerWrap = styled.div` position: relative; `;

export const PickerLoading = styled.span`
  position: absolute; right: 10px; top: 9px;
  font-size: 11px; color: ${p => p.theme.colors.ashLight};
`;

export const PickerResults = styled.div`
  position: absolute;
  z-index: 9999;
  top: 100%; left: 0; right: 0;
  background: ${p => p.theme.colors.white};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  max-height: 180px;
  overflow-y: auto;
`;

export const PickerResultRow = styled.div`
  padding: 7px 12px;
  cursor: pointer;
  font-size: 13px;
  color: ${p => p.theme.colors.onyx};
  border-bottom: 1px solid ${p => p.theme.colors.border};

  &:hover { background: ${p => p.theme.colors.greige}; }
`;

export const PickerResultEmail = styled.span` color: ${p => p.theme.colors.ashLight}; margin-left: 6px; font-size: 11px; `;

export const PickerClearBtn = styled.button`
  position: absolute; right: 8px; top: 8px;
  background: none; border: none;
  color: ${p => p.theme.colors.ashLight};
  cursor: pointer; font-size: 16px; line-height: 1;
`;

export const ManageLayout = styled.div`
  display: flex;
  gap: 20px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;

export const UserListCol = styled.div`
  width: 260px;
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const UserListBox = styled.div`
  flex: 1;
  overflow-y: auto;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 6px;
  min-height: 200px;
`;

export const UserListMsg = styled.div` padding: 16px; color: ${p => p.theme.colors.ashLight}; font-size: 13px; text-align: center; `;

export const UserListRow = styled.div`
  padding: 9px 12px;
  cursor: pointer;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background: ${p => (p.selected ? `${p.theme.colors.espresso}0f` : 'transparent')};
  border-left: 3px solid ${p => (p.selected ? p.theme.colors.onyx : 'transparent')};

  &:hover { background: ${p => (p.selected ? `${p.theme.colors.espresso}0f` : p.theme.colors.greige)}; }
`;

export const UserRowName = styled.div` font-size: 13px; font-weight: 600; color: ${p => p.theme.colors.onyx}; `;
export const UserRowSub = styled.div` font-size: 11px; color: ${p => p.theme.colors.ash}; margin-top: 1px; `;
export const UserRowInactive = styled.span` color: ${p => p.theme.colors.danger}; margin-left: 4px; `;
export const UserRowMeta = styled.div` font-size: 11px; color: ${p => p.theme.colors.ashLight}; `;

export const EditCol = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

export const EditEmptyState = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: ${p => p.theme.colors.ashLight};
`;

export const EditHeaderRow = styled.div`
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
`;

export const EditTitle = styled.h3` margin: 0; font-size: 15px; font-weight: 700; color: ${p => p.theme.colors.onyx}; `;

export const BackBtn = styled.button`
  background: none;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  color: ${p => p.theme.colors.ash};
  cursor: pointer;
`;
