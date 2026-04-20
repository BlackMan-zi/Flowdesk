import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getFormDefinition, replaceFormFields, deleteFormDefinition,
  updateFormDefinition, createApprovalTemplate, updateApprovalTemplate,
} from '../../api/forms'
import { listUsers, listRoles } from '../../api/users'
import PDFFormBuilder from '../../components/pdf/PDFFormBuilder'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { AlertTriangle } from 'lucide-react'

export default function FormBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const { data: formDef, isLoading } = useQuery({
    queryKey: ['form-definition', id],
    queryFn: () => getFormDefinition(id).then(r => r.data)
  })

  // For the approval step configuration UI
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => listUsers().then(r => r.data),
  })
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => listRoles().then(r => r.data),
  })

  /**
   * Save fields + approval steps.
   * approvalSteps is the local state array from PDFFormBuilder (may be undefined if
   * the approval panel was never opened / no change made).
   */
  const handleSave = async (fields, approvalSteps) => {
    // 1. Always save the field layout
    await replaceFormFields(id, fields)

    // 2. Save approval template steps if provided
    if (approvalSteps !== undefined) {
      const stepsPayload = approvalSteps.map(s => ({
        step_order:        s.step_order,
        step_label:        s.step_label || null,
        role_type:         s.source_type === 'hierarchy'     ? 'Hierarchy'
                         : s.source_type === 'specific_user' ? 'SpecificUser'
                         : 'Functional',
        role_id:           s.source_type === 'role'          ? (s.role_id || null) : null,
        specific_user_id:  s.source_type === 'specific_user' ? (s.specific_user_id || null) : null,
        hierarchy_level:   s.source_type === 'hierarchy'     ? (s.hierarchy_level || 'manager') : null,
        skip_if_missing:   s.skip_if_missing || false,
        delegation_allowed: true,
      }))

      if (formDef?.approval_template_id) {
        // Update existing template
        await updateApprovalTemplate(formDef.approval_template_id, { steps: stepsPayload })
      } else if (stepsPayload.length > 0) {
        // Create a new template and link it to the form definition
        const res = await createApprovalTemplate({
          name: `${formDef?.name || 'Form'} Workflow`,
          steps: stepsPayload,
        })
        await updateFormDefinition(id, { approval_template_id: res.data.id })
      }
    }

    qc.removeQueries({ queryKey: ['form-definition', id] })
    qc.invalidateQueries({ queryKey: ['form-definitions'] })
    navigate('/admin/form-definitions')
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteFormDefinition(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['form-definitions'] })
      navigate('/admin/form-definitions')
    },
    onError: (err) => setDeleteError(err.response?.data?.detail || 'Delete failed.')
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-screen">
      <Spinner />
    </div>
  )

  return (
    <>
      <PDFFormBuilder
        formDef={formDef}
        initialFields={formDef?.fields || []}
        onSave={handleSave}
        onBack={() => navigate('/admin/form-definitions')}
        onDelete={() => { setDeleteError(''); setDeleteOpen(true) }}
        users={users}
        roles={roles}
      />

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Form Definition"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-700 space-y-1">
              <p>Delete <strong>"{formDef?.name}"</strong>?</p>
              <p className="text-slate-500 text-xs">
                This cannot be undone. Any forms currently under review will be cancelled.
              </p>
            </div>
          </div>
          {deleteError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>
          )}
          <div className="flex gap-3">
            <Button
              onClick={() => deleteMutation.mutate()}
              loading={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 border-red-600 text-white"
            >
              Delete
            </Button>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
