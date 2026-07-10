import { useEffect, useRef } from 'react';
import {
  MenuWrap, MenuBody, MenuTitle, InfoList, InfoLabel, InfoValue,
  MenuFooter, ChangePasswordBtn,
} from '../styles/ProfileMenu.styles';

export default function ProfileMenu({
  user,
  open,
  onClose,
  onChangePassword,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose?.();
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (!open) return null;

  const name =
    [user?.firstName, user?.lastName]
      .filter(Boolean)
      .join(' ') ||
    user?.username ||
    'User';

  return (
    <MenuWrap ref={ref}>
      <MenuBody>
        <MenuTitle>My Profile</MenuTitle>

        <InfoList>
          <div>
            <InfoLabel>Name</InfoLabel>
            <InfoValue>{name}</InfoValue>
          </div>

          <div>
            <InfoLabel>Email</InfoLabel>
            <InfoValue>{user?.email || '-'}</InfoValue>
          </div>

          <div>
            <InfoLabel>Username</InfoLabel>
            <InfoValue>{user?.username || '-'}</InfoValue>
          </div>
        </InfoList>
      </MenuBody>

      <MenuFooter>
        <ChangePasswordBtn type="button" onClick={onChangePassword}>
          Change Password
        </ChangePasswordBtn>
      </MenuFooter>
    </MenuWrap>
  );
}
