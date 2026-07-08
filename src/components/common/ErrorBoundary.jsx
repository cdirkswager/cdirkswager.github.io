import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page container text-center">
          <h2 className="text-gold mb-2">Something went wrong</h2>
          <p className="text-muted mb-3">An unexpected error occurred. Try refreshing the page.</p>
          <button className="btn btn-primary" onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/' }}>
            Return Home
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
