export const identity = {
  verify:         (opts) => window.api.closeAssurance.identity.verify(opts),
  userList:       ()     => window.api.closeAssurance.identity.userList(),
  userCreate:     (opts) => window.api.closeAssurance.identity.userCreate(opts),
  userDeactivate: (id)   => window.api.closeAssurance.identity.userDeactivate(id),
  userSetPin:     (opts) => window.api.closeAssurance.identity.userSetPin(opts),
};
