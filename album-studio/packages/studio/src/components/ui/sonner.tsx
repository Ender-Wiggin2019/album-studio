import { Toaster as Sonner, type ToasterProps } from 'sonner'

function Toaster(props: ToasterProps): React.JSX.Element {
  return <Sonner theme="light" position="bottom-right" richColors closeButton {...props} />
}

export { Toaster }
